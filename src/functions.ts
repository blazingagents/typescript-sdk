import { z } from "zod";
import {
  type ChatFunctionCallEvent,
  type ChatFunctionDefinitions,
  type ChatFunctionOutcome,
  chatFunctionCallEventSchema,
  chatFunctionDefinitionsSchema,
  chatFunctionOutcomeSchema,
  claimChatFunctionResponseSchema,
  resolveChatFunctionResponseSchema,
} from "./contracts/entities/chat.ts";
import { BlazingAgentsError } from "./errors.ts";
import { requestJson } from "./http.ts";
import type { HttpConfig } from "./types.ts";

export interface ChatFunctionContext {
  /** The function call ID; a new user resend produces a new key. */
  idempotencyKey: string;
  /** Aborts at the call deadline or when the chat stream ends. */
  signal: AbortSignal;
}

export interface ChatFunction<
  Schema extends z.ZodType = z.ZodType,
  Output = unknown,
> {
  description: string;
  execute(
    input: z.output<Schema>,
    context: ChatFunctionContext
  ): Output | Promise<Output>;
  inputSchema: Schema;
}

// biome-ignore lint/suspicious/noExplicitAny: handler inputs vary per function
export type ChatFunctions = Record<string, ChatFunction<any>>;

/** Declares a caller-local function whose handler input is inferred from its Zod schema. */
export function defineFunction<Schema extends z.ZodType, Output>(
  definition: ChatFunction<Schema, Output>
): ChatFunction<Schema, Output> {
  return definition;
}

/** Converts handlers to the wire definitions: descriptions and input JSON Schema only. */
export function toChatFunctionDefinitions(
  functions: ChatFunctions
): ChatFunctionDefinitions {
  try {
    return chatFunctionDefinitionsSchema.parse(
      Object.fromEntries(
        Object.entries(functions).map(([name, fn]) => {
          const { $schema: _, ...inputSchema } = z.toJSONSchema(
            fn.inputSchema,
            { io: "input" }
          );
          return [name, { description: fn.description, inputSchema }];
        })
      )
    );
  } catch (cause) {
    throw new BlazingAgentsError(
      {
        code: "invalid_request",
        message: `Invalid chat functions: ${
          cause instanceof z.ZodError ? z.prettifyError(cause) : String(cause)
        }`,
      },
      { cause }
    );
  }
}

const EVENT_BOUNDARY = /\r\n\r\n|\n\n/;
const LINE_BREAK = /\r?\n/;
const DELAY_SECONDS = /^\d+$/;
const FUNCTION_CALL_TYPE = "data-ba-function-call";
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 2000;
/** Results may retry past the deadline to recover an already accepted receipt. */
const RESULT_RETRY_GRACE_MS = 30_000;

/**
 * `undefined` forwards the SSE block unchanged; `null` marks a recognized
 * but malformed function event.
 */
function functionCallFrom(
  block: string
): ChatFunctionCallEvent | null | undefined {
  const data = block
    .split(LINE_BREAK)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
    .join("\n");
  if (!data.includes(FUNCTION_CALL_TYPE)) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }
  if ((parsed as { type?: unknown } | null)?.type !== FUNCTION_CALL_TYPE) {
    return;
  }
  return chatFunctionCallEventSchema.safeParse(parsed).data ?? null;
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const value = headers?.get("retry-after");
  if (!value) {
    return;
  }
  const ms = DELAY_SECONDS.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - Date.now();
  return Number.isNaN(ms) ? undefined : Math.max(0, ms);
}

/** The delay before retrying, or `undefined` for a permanent failure. */
function retryDelayMs(
  { code, headers, status }: BlazingAgentsError,
  attempt: number
): number | undefined {
  const retryable =
    status === undefined
      ? code === "network_error"
      : status === 408 || status === 429 || status >= 500;
  if (!retryable) {
    return;
  }
  return (
    retryAfterMs(headers) ??
    Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS)
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * POSTs one protocol request, retrying transient failures with the same
 * body until `until` or abort. A 409 is a lost or stale race; other
 * permanent failures throw.
 */
async function postWithRetry(
  config: HttpConfig,
  path: string,
  json: unknown,
  schema: z.ZodType,
  until: number,
  signal: AbortSignal
): Promise<"accepted" | "conflict" | "expired"> {
  for (let attempt = 1; ; attempt += 1) {
    const remaining = until - Date.now();
    if (signal.aborted || remaining <= 0) {
      return "expired";
    }
    try {
      await requestJson(
        config,
        path,
        {
          json,
          method: "POST",
          signal: AbortSignal.any([signal, AbortSignal.timeout(remaining)]),
        },
        schema
      );
      return "accepted";
    } catch (caught) {
      /** `requestJson` reports every failure as a BlazingAgentsError. */
      const error = caught as BlazingAgentsError;
      if (error.status === 409) {
        return "conflict";
      }
      if (signal.aborted || Date.now() >= until) {
        return "expired";
      }
      const delay = retryDelayMs(error, attempt);
      if (delay === undefined) {
        throw error;
      }
      if (Date.now() + delay >= until) {
        return "expired";
      }
      await sleep(delay, signal);
    }
  }
}

const invalidResult: ChatFunctionOutcome = {
  kind: "error",
  message: "Function returned an invalid result.",
};

async function execute(
  functions: ChatFunctions,
  { id, name, input }: ChatFunctionCallEvent["data"],
  signal: AbortSignal
): Promise<ChatFunctionOutcome> {
  const fn = Object.hasOwn(functions, name) ? functions[name] : undefined;
  if (fn === undefined) {
    return { kind: "error", message: `Function ${name} is not available.` };
  }
  const parsed = fn.inputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "error", message: "Invalid function input." };
  }
  let value: unknown;
  try {
    value = await fn.execute(parsed.data, { idempotencyKey: id, signal });
  } catch {
    return { kind: "error", message: "Function execution failed." };
  }
  try {
    const serialized = JSON.stringify(value);
    return (
      chatFunctionOutcomeSchema.safeParse({
        kind: "output",
        value: serialized === undefined ? null : JSON.parse(serialized),
      }).data ?? invalidResult
    );
  } catch {
    return invalidResult;
  }
}

export interface FunctionDispatchTarget {
  abortSignal?: AbortSignal;
  agentId: string;
  functions: ChatFunctions;
  sessionId: string;
}

/**
 * Reads the chat SSE eagerly, executes claimed function calls without
 * blocking the read loop, and returns the remaining SSE bytes unchanged.
 */
export function dispatchChatFunctions(
  config: HttpConfig,
  target: FunctionDispatchTarget,
  body: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  /** Caller abort or consumer cancellation: stops every retry. */
  const stop = new AbortController();
  /** Also aborted when the stream ends: stops claims and handlers. */
  const handlers = new AbortController();
  const abort = () => stop.abort();
  target.abortSignal?.addEventListener("abort", abort, { once: true });
  stop.signal.addEventListener("abort", () => handlers.abort(), {
    once: true,
  });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const dispatched = new Set<string>();
  let output!: ReadableStreamDefaultController<Uint8Array>;
  let finished = false;

  const fail = (error: unknown) => {
    if (finished) {
      return;
    }
    finished = true;
    output.error(error);
    handlers.abort();
    reader.cancel(error).catch(() => undefined);
  };

  const runCall = async (call: ChatFunctionCallEvent["data"]) => {
    const path = `/v1/agents/${target.agentId}/sessions/${target.sessionId}/function-calls/${call.id}`;
    const claimRequestId = crypto.randomUUID();
    const deadline = Date.parse(call.deadlineAt);
    const claim = await postWithRetry(
      config,
      `${path}/claim`,
      { claimRequestId },
      claimChatFunctionResponseSchema,
      deadline,
      handlers.signal
    );
    if (claim !== "accepted") {
      return;
    }
    const outcome = await execute(
      target.functions,
      call,
      AbortSignal.any([
        handlers.signal,
        AbortSignal.timeout(Math.max(0, deadline - Date.now())),
      ])
    );
    await postWithRetry(
      config,
      `${path}/result`,
      { claimRequestId, outcome },
      resolveChatFunctionResponseSchema,
      deadline + RESULT_RETRY_GRACE_MS,
      stop.signal
    );
  };

  const handleBlock = (block: string, raw: string) => {
    const call = functionCallFrom(block);
    if (call === undefined) {
      if (raw && !finished) {
        output.enqueue(encoder.encode(raw));
      }
    } else if (call === null) {
      fail(
        new BlazingAgentsError({
          code: "stream_error",
          message: "The server sent a malformed function call event.",
        })
      );
    } else if (!dispatched.has(call.data.id)) {
      dispatched.add(call.data.id);
      runCall(call.data).catch(fail);
    }
  };

  const pump = async () => {
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        for (
          let match = EVENT_BOUNDARY.exec(buffer);
          match;
          match = EVENT_BOUNDARY.exec(buffer)
        ) {
          const end = match.index + match[0].length;
          handleBlock(buffer.slice(0, match.index), buffer.slice(0, end));
          buffer = buffer.slice(end);
        }
      }
      handleBlock("", buffer + decoder.decode());
      if (!finished) {
        finished = true;
        output.close();
      }
    } catch (error) {
      fail(error);
    } finally {
      handlers.abort();
      target.abortSignal?.removeEventListener("abort", abort);
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
      pump();
    },
    async cancel(reason) {
      finished = true;
      stop.abort();
      await reader.cancel(reason);
    },
  });
}
