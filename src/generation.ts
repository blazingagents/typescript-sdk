import { createTextStreamResponse, parsePartialJson } from "ai";
import { sessionIdSchema } from "./contracts/ids.ts";
import { BlazingAgentsError } from "./errors.ts";
import {
  dispatchChatFunctions,
  type FunctionDispatchTarget,
  toChatFunctionDefinitions,
} from "./functions.ts";
import { requestStream } from "./http.ts";
import type {
  ChatInput,
  ChatResult,
  CompletionInput,
  CompletionResult,
  ContinueChatInput,
  HttpConfig,
  ObjectInput,
  ObjectResult,
  TerminalStreamResult,
} from "./types.ts";

/**
 * Creates or resumes a Session and returns its SSE stream and Session ID.
 * @param config - Authentication, base URL, and transport configuration.
 * @param input - Agent, message or stored Prompt, and optional existing Session.
 * @returns The Session ID promise and single-owner SSE accessors.
 */
export async function chat(
  config: HttpConfig,
  input: ChatInput
): Promise<ChatResult> {
  const body = buildChatBody(input);
  if (input.functions && Object.keys(input.functions).length > 0) {
    body.functions = toChatFunctionDefinitions(input.functions);
  }
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
    ...(input.abortSignal ? { signal: input.abortSignal } : {}),
  });
  return buildChatResult(config, response, input.sessionId, {
    agentId: input.agentId,
    functions: input.functions,
    abortSignal: input.abortSignal,
  });
}

/**
 * Submits a complete Tool approval round and streams its continuation.
 * @param config - Authentication, base URL, and transport configuration.
 * @param input - Agent, Session, and decisions for the complete approval round.
 * @returns The Session ID promise and continuation SSE accessors.
 */
export async function continueChat(
  config: HttpConfig,
  input: ContinueChatInput
): Promise<ChatResult> {
  const response = await requestStream(
    config,
    `/v1/agents/${input.agentId}/sessions/${input.sessionId}/tool-approvals/continue`,
    {
      json: {
        decisions: input.decisions,
        ...(input.functions === undefined
          ? {}
          : { functions: toChatFunctionDefinitions(input.functions) }),
      },
      method: "POST",
      clientRequestId: input.clientRequestId,
      signal: input.abortSignal,
    }
  );
  return buildChatResult(config, response, input.sessionId, {
    agentId: input.agentId,
    functions: input.functions,
    abortSignal: input.abortSignal,
  });
}

/**
 * Keeps status and headers while filtering the SSE body. Missing or locked
 * bodies pass through so the stream result reports them as `stream_error`.
 * @param response - Upstream HTTP response.
 * @param filter - Transforms upstream SSE bytes before exposing them to the caller.
 */
export function withFilteredBody(
  response: Response,
  filter: (body: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>
): Response {
  if (!response.body || response.body.locked) {
    return response;
  }
  return new Response(filter(response.body), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * Builds a chat request body from messages or a stored Prompt.
 */
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
  if ("message" in input) {
    base.messages = [input.message];
  } else if ("messages" in input) {
    base.messages = input.messages;
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

/**
 * Combines the Session ID promise with a single-owner SSE result.
 */
function buildChatResult(
  config: HttpConfig,
  response: Response,
  resumeSessionId: string | undefined,
  dispatch: Omit<FunctionDispatchTarget, "functions" | "sessionId"> &
    Partial<Pick<FunctionDispatchTarget, "functions">>
): ChatResult {
  /**
   * `sessionId` resolves from the `Location` header on create, or to the
   * passed id on resume. Read eagerly (the header is available before the
   * body streams) so awaiting `result.sessionId` does not depend on
   * draining the stream.
   */
  let sessionId: string | undefined = resumeSessionId;
  let sessionIdError: unknown;
  if (sessionId === undefined) {
    try {
      sessionId = sessionIdFromLocation(
        response,
        response.headers.get("x-request-id") ?? undefined
      );
    } catch (error) {
      sessionIdError = error;
    }
  }
  const sessionIdPromise =
    sessionId === undefined
      ? Promise.reject(sessionIdError)
      : Promise.resolve(sessionId);
  sessionIdPromise.catch(() => {
    /* no-op — prevents unhandled rejection if the caller never awaits */
  });
  const { functions } = dispatch;
  const streamResponse =
    functions && sessionId !== undefined
      ? withFilteredBody(response, (body) =>
          dispatchChatFunctions(
            config,
            { ...dispatch, functions, sessionId },
            body
          )
        )
      : response;

  return {
    sessionId: sessionIdPromise,
    ...buildTerminalStreamResult(streamResponse, "chat"),
  };
}

/**
 * Creates single-owner SSE response and byte-stream accessors.
 * @param response - Upstream HTTP response.
 * @param resourceName - Resource label used in stream errors.
 * @param filter - Transforms upstream SSE bytes before exposing them to the caller.
 */
export function buildTerminalStreamResult(
  response: Response,
  resourceName: string,
  filter?: (body: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>
): TerminalStreamResult {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const location = response.headers.get("location");
  let bodyClaimed = false;
  /**
   * Claims the response body once and normalizes stream failures.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
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
    const body = responseBodyStream(response, requestId, resourceName);
    return normalizeStreamErrors(
      filter ? filter(body) : body,
      requestId,
      `The ${resourceName} response stream failed.`
    );
  };

  return {
    requestId,
    toStream: claimBody,
    /** Claims the response relay once. */
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

/**
 * Preserves a matching stream error or wraps a failure with request correlation.
 */
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

/**
 * Wraps reads and cancellation failures as correlated SDK stream errors.
 */
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
    /**
     * Reads one upstream chunk and normalizes stream failures.
     */
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
    /**
     * Cancels the upstream reader with the consumer reason.
     */
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch (cause) {
        throw toStreamError(cause, requestId, fallbackMessage);
      }
    },
  });
}

/**
 * Returns the response body or a stream that fails when the body is missing.
 */
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
    /**
     * Initializes the stream controller.
     */
    start(controller) {
      controller.error(error);
    },
  });
}

/**
 * Copies request correlation and Session location into relay response headers.
 */
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

/**
 * Builds a stateless prompt request with the selected output format.
 */
function buildStatelessGenerationBody(
  input: CompletionInput | ObjectInput,
  output: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = { output };
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

/**
 * Starts stateless text generation with independent final, incremental, and response outputs.
 * @param config - Authentication, base URL, and transport configuration.
 * @param input - Agent and literal prompt or stored Prompt reference.
 * @returns Independent text stream, final text promise, and response relay.
 */
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
    ...(input.abortSignal ? { signal: input.abortSignal } : {}),
  });
  return buildCompletionResult(response);
}

/**
 * Splits text output into a final promise, incremental stream, and response relay.
 */
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

/**
 * Starts stateless JSON generation with partial objects and a final parsed value.
 * @param config - Authentication, base URL, and transport configuration.
 * @param input - Agent, prompt source, and JSON output schema.
 * @returns Partial JSON objects, a final JSON promise, and a text response relay.
 */
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
    ...(input.abortSignal ? { signal: input.abortSignal } : {}),
  });
  return buildObjectResult(response);
}

/**
 * Parses partial and final JSON from independent text-stream branches.
 */
function buildObjectResult(response: Response): ObjectResult {
  const { finalStream, outputStream, requestId, toResponse } =
    buildStatelessGenerationStreams(response, "object");

  let accumulatedText = "";
  const partialObjectStream = outputStream.pipeThrough(
    new TransformStream<string, unknown>({
      /**
       * Accumulates generated text and emits each available partial JSON value.
       */
      async transform(chunk, controller) {
        accumulatedText += chunk;
        const { value } = await parsePartialJson(accumulatedText);
        if (value !== undefined) {
          controller.enqueue(value);
        }
      },
      /**
       * Rejects malformed final JSON when the text stream ends.
       */
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

/**
 * Splits decoded text into final, public, and response-relay branches.
 */
function buildStatelessGenerationStreams(
  response: Response,
  resourceName: string
): {
  finalStream: ReadableStream<string>;
  outputStream: ReadableStream<string>;
  requestId: string | undefined;
  /**
   * Claims the response relay once and returns its HTTP response.
   * @returns The response relay.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
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
    /** Claims the response relay once. */
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
