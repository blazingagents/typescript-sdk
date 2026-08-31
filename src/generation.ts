import { createTextStreamResponse, parsePartialJson } from "ai";
import { sessionIdSchema } from "./contracts/ids.ts";
import { BlazingAgentsError } from "./errors.ts";
import { requestStream } from "./http.ts";
import type {
  ChatInput,
  ChatResult,
  CompletionInput,
  CompletionResult,
  HttpConfig,
  ObjectInput,
  ObjectResult,
  TerminalStreamResult,
} from "./types.ts";

// --- chat ---

export async function chat(
  config: HttpConfig,
  input: ChatInput
): Promise<ChatResult> {
  const body = buildChatBody(input);
  /**
   * URL presence is the mode: no `sessionId` → create
   * (`POST /v1/agents/:agentId/sessions`, server mints the `ss_` id,
   * returned via `Location`); `sessionId` present → resume
   * (`POST /v1/agents/:agentId/sessions/:sessionId`).
   */
  const path =
    input.sessionId === undefined
      ? `/v1/agents/${input.agentId}/sessions`
      : `/v1/agents/${input.agentId}/sessions/${input.sessionId}`;
  const response = await requestStream(config, path, {
    json: body,
    method: "POST",
    clientRequestId: input.clientRequestId,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return buildChatResult(response, input.sessionId);
}

function buildChatBody(input: ChatInput): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  // Stryker disable next-line ConditionalExpression: JSON serialization omits an undefined trigger.
  if (input.trigger !== undefined) {
    base.trigger = input.trigger;
  }
  // Stryker disable next-line ConditionalExpression: JSON serialization omits an undefined message id.
  if (input.messageId !== undefined) {
    base.messageId = input.messageId;
  }
  // Stryker disable next-line ConditionalExpression: JSON serialization omits an undefined Version Pin.
  if (input.version !== undefined) {
    base.version = input.version;
  }
  if ("message" in input) {
    base.message = input.message;
  } else {
    base.promptId = input.promptId;
    // Stryker disable next-line ConditionalExpression: JSON serialization omits undefined variables.
    if (input.variables !== undefined) {
      base.variables = input.variables;
    }
  }
  // Stryker disable next-line ConditionalExpression: JSON serialization omits an undefined user id.
  if (input.userId !== undefined) {
    base.userId = input.userId;
  }
  // Stryker disable next-line ConditionalExpression: JSON serialization omits undefined metadata.
  if (input.metadata !== undefined) {
    base.metadata = input.metadata;
  }
  return base;
}

/**
 * Extracts the server-minted `ss_` id from the `Location` header on the
 * create path. The header is `/v1/agents/:agentId/sessions/:newId`; the
 * id is the trailing path segment, validated against `sessionIdSchema`
 * so a malformed or non-`ss_` value surfaces as a `stream_error` instead
 * of flowing into resume calls as an untyped string.
 */
function sessionIdFromLocation(
  response: Response,
  requestId: string | undefined
): string {
  const location = response.headers.get("location");
  if (!location) {
    const message =
      "The server did not return a session id (no Location header).";
    throw new BlazingAgentsError(
      {
        code: "stream_error",
        message,
        requestId,
      },
      { cause: new Error(message) }
    );
  }
  const id = location.split("/").pop();
  const parsed = sessionIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new BlazingAgentsError(
      {
        code: "stream_error",
        message: "The server returned a malformed session Location header.",
        requestId,
      },
      { cause: parsed.error }
    );
  }
  return parsed.data;
}

function buildChatResult(
  response: Response,
  resumeSessionId: string | undefined
): ChatResult {
  const terminalResult = buildTerminalStreamResult(response, "chat");
  /**
   * `sessionId` resolves from the `Location` header on create, or to the
   * passed id on resume. Read eagerly (the header is available before the
   * body streams) so awaiting `result.sessionId` does not depend on
   * draining the stream.
   */
  let sessionIdPromise: Promise<string>;
  if (resumeSessionId === undefined) {
    try {
      sessionIdPromise = Promise.resolve(
        sessionIdFromLocation(response, terminalResult.requestId)
      );
    } catch (error) {
      sessionIdPromise = Promise.reject(error);
    }
  } else {
    sessionIdPromise = Promise.resolve(resumeSessionId);
  }
  sessionIdPromise.catch(() => {
    /* no-op — prevents unhandled rejection if the caller never awaits */
  });

  return {
    sessionId: sessionIdPromise,
    ...terminalResult,
  };
}

export function buildTerminalStreamResult(
  response: Response,
  resourceName: string
): TerminalStreamResult {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const location = response.headers.get("location");
  let bodyClaimed = false;
  const claimBody = (): ReadableStream<Uint8Array> => {
    if (bodyClaimed) {
      const message = `The ${resourceName} response body has already been claimed.`;
      const cause = new Error(message);
      throw new BlazingAgentsError(
        {
          code: "stream_error",
          message,
          requestId,
        },
        { cause }
      );
    }
    bodyClaimed = true;
    return normalizeStreamErrors(
      responseBodyStream(response, requestId, resourceName),
      requestId,
      `The ${resourceName} response stream failed.`
    );
  };

  return {
    requestId,
    toResponse: () => {
      const headers = replacementResponseHeaders(requestId, location);
      headers.set("content-type", "text/event-stream");
      headers.set("cache-control", "no-cache");
      headers.set("connection", "keep-alive");
      headers.set("x-vercel-ai-ui-message-stream", "v1");
      headers.set("x-accel-buffering", "no");
      try {
        return new Response(claimBody(), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (cause) {
        throw toStreamError(
          cause,
          requestId,
          `The ${resourceName} response stream failed.`
        );
      }
    },
  };
}

function toStreamError(
  cause: unknown,
  requestId: string | undefined,
  fallbackMessage: string | ((cause: unknown) => string)
): BlazingAgentsError {
  if (
    BlazingAgentsError.isInstance(cause) &&
    cause.code === "stream_error" &&
    cause.requestId === requestId
  ) {
    return cause;
  }
  let message: string;
  if (cause instanceof Error) {
    message = cause.message;
  } else if (typeof fallbackMessage === "function") {
    message = fallbackMessage(cause);
  } else {
    message = fallbackMessage;
  }
  return new BlazingAgentsError(
    {
      code: "stream_error",
      message,
      requestId,
    },
    { cause }
  );
}

function normalizeStreamErrors<T>(
  stream: ReadableStream<T>,
  requestId: string | undefined,
  fallbackMessage: string | ((cause: unknown) => string)
): ReadableStream<T> {
  let reader: ReadableStreamDefaultReader<T>;
  try {
    reader = stream.getReader();
  } catch (cause) {
    throw toStreamError(cause, requestId, fallbackMessage);
  }
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (cause) {
        controller.error(toStreamError(cause, requestId, fallbackMessage));
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch (cause) {
        throw toStreamError(cause, requestId, fallbackMessage);
      }
    },
  });
}

function responseBodyStream(
  response: Response,
  requestId: string | undefined,
  resourceName: string
): ReadableStream<Uint8Array> {
  if (response.body) {
    return response.body;
  }
  const message = `The ${resourceName} response did not include a body.`;
  const cause = new Error(message);
  const error = new BlazingAgentsError(
    {
      code: "stream_error",
      message,
      requestId,
    },
    { cause }
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    },
  });
}

function replacementResponseHeaders(
  requestId: string | undefined,
  location: string | null
): Headers {
  const headers = new Headers();
  if (requestId !== undefined) {
    headers.set("x-request-id", requestId);
  }
  if (location !== null) {
    headers.set("location", location);
  }
  return headers;
}

function buildStatelessGenerationBody(
  input: CompletionInput | ObjectInput,
  output: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = { output };
  // Stryker disable next-line ConditionalExpression: JSON serialization omits an undefined Version Pin.
  if (input.version !== undefined) {
    body.version = input.version;
  }
  if ("prompt" in input) {
    body.prompt = input.prompt;
  } else {
    body.promptId = input.promptId;
    // Stryker disable next-line ConditionalExpression: JSON serialization omits undefined variables.
    if (input.variables !== undefined) {
      body.variables = input.variables;
    }
  }
  // Stryker disable next-line ConditionalExpression: JSON serialization omits an undefined user id.
  if (input.userId !== undefined) {
    body.userId = input.userId;
  }
  // Stryker disable next-line ConditionalExpression: JSON serialization omits undefined metadata.
  if (input.metadata !== undefined) {
    body.metadata = input.metadata;
  }
  return body;
}

// --- completion ---

export async function completion(
  config: HttpConfig,
  input: CompletionInput
): Promise<CompletionResult> {
  const body = buildStatelessGenerationBody(input, { type: "text" });
  const path = `/v1/agents/${input.agentId}/generation`;
  const response = await requestStream(config, path, {
    json: body,
    method: "POST",
    clientRequestId: input.clientRequestId,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return buildCompletionResult(response);
}

function buildCompletionResult(response: Response): CompletionResult {
  const { finalStream, outputStream, requestId, toResponse } =
    buildStatelessGenerationStreams(response, "completion");

  const textPromise = (async () => {
    let text = "";
    for await (const delta of finalStream) {
      text += delta;
    }
    return text;
  })();
  /**
   * Attach a no-op rejection handler so the promise doesn't trigger an
   * unhandled-rejection warning if the caller only uses `textStream` or
   * `toResponse()` without awaiting `text`.
   */
  textPromise.catch(() => {
    /* no-op — prevents unhandled rejection if the caller never awaits */
  });

  return {
    requestId,
    textStream: outputStream,
    text: textPromise,
    toResponse,
  };
}

// --- object ---

export async function objectGeneration(
  config: HttpConfig,
  input: ObjectInput
): Promise<ObjectResult> {
  const body = buildStatelessGenerationBody(input, {
    type: "object",
    schema: input.schema,
  });
  const path = `/v1/agents/${input.agentId}/generation`;
  const response = await requestStream(config, path, {
    json: body,
    method: "POST",
    clientRequestId: input.clientRequestId,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return buildObjectResult(response);
}

function buildObjectResult(response: Response): ObjectResult {
  const { finalStream, outputStream, requestId, toResponse } =
    buildStatelessGenerationStreams(response, "object");

  let accumulatedText = "";
  const partialObjectStream = outputStream.pipeThrough(
    new TransformStream<string, unknown>({
      async transform(chunk, controller) {
        accumulatedText += chunk;
        const { value } = await parsePartialJson(accumulatedText);
        if (value !== undefined) {
          controller.enqueue(value);
        }
      },
      flush() {
        try {
          JSON.parse(accumulatedText);
        } catch (cause) {
          throw new BlazingAgentsError(
            {
              code: "stream_error",
              message: "The agent produced invalid JSON.",
              requestId,
            },
            { cause }
          );
        }
      },
    })
  );

  const objectPromise = (async () => {
    let text = "";
    for await (const delta of finalStream) {
      text += delta;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new BlazingAgentsError(
        {
          code: "stream_error",
          message: "The agent produced invalid JSON.",
          requestId,
        },
        { cause }
      );
    }
  })();
  objectPromise.catch(() => {
    /* no-op — prevents unhandled rejection if the caller never awaits */
  });

  return {
    partialObjectStream,
    object: objectPromise,
    requestId,
    toResponse,
  };
}

// --- helpers ---

function buildStatelessGenerationStreams(
  response: Response,
  resourceName: string
): {
  finalStream: ReadableStream<string>;
  outputStream: ReadableStream<string>;
  requestId: string | undefined;
  toResponse: () => Response;
} {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const location = response.headers.get("location");
  const rawStream = responseBodyStream(response, requestId, resourceName);
  const textStream = decodeTextStream(rawStream, requestId, resourceName);
  /**
   * The public output, awaited final value, and response relay each need a
   * branch. `tee()` produces two branches, so tee twice.
   */
  const [outputStream, forRest] = textStream.tee();
  const [finalStream, relayStream] = forRest.tee();
  let responseBodyClaimed = false;

  return {
    finalStream,
    outputStream,
    requestId,
    toResponse: () => {
      if (responseBodyClaimed) {
        const message = `The ${resourceName} response body has already been claimed.`;
        throw new BlazingAgentsError(
          {
            code: "stream_error",
            message,
            requestId,
          },
          { cause: new Error(message) }
        );
      }
      responseBodyClaimed = true;
      const headers = replacementResponseHeaders(requestId, location);
      headers.set("content-type", "text/plain; charset=utf-8");
      try {
        return createTextStreamResponse({
          stream: relayStream,
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (cause) {
        throw toStreamError(
          cause,
          requestId,
          `The ${resourceName} response stream failed.`
        );
      }
    },
  };
}

/**
 * Wraps a `ReadableStream<Uint8Array>` as a `ReadableStream<string>` via
 * `TextDecoderStream`. The cast works around a TS/Node-types mismatch
 * where `TextDecoderStream`'s writable accepts `BufferSource` but the
 * stream's chunks are typed as `Uint8Array<ArrayBufferLike>`.
 */
function decodeTextStream(
  raw: ReadableStream<Uint8Array>,
  requestId: string | undefined,
  resourceName: string
): ReadableStream<string> {
  let decodedStream: ReadableStream<string>;
  try {
    decodedStream = raw.pipeThrough(
      new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>
    );
  } catch (cause) {
    throw toStreamError(
      cause,
      requestId,
      `The ${resourceName} response stream failed.`
    );
  }
  return normalizeStreamErrors(decodedStream, requestId, (cause) =>
    typeof cause === "string"
      ? cause
      : `The ${resourceName} response stream failed.`
  );
}
