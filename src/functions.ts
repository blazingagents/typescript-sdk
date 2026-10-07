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
  /**
   * Runs a caller-local function with validated input and deadline cancellation.
   * @param input - Input parsed by inputSchema.
   * @param context - Function-call idempotency key and cancellation signal.
   * @returns The function output, synchronously or as a promise.
   */
  execute(
    input: z.output<Schema>,
    context: ChatFunctionContext
  ): Output | Promise<Output>;
  inputSchema: Schema;
}

export type ChatFunctions = Record<string, ChatFunction>;

/**
 * Declares a caller-local function whose handler input is inferred from its Zod schema.
 * @param definition - Description, input schema, and local handler.
 * @returns The unchanged definition with inferred handler types.
 */
export function defineFunction<Schema extends z.ZodType, Output>(
  definition: ChatFunction<Schema, Output>
): ChatFunction<Schema, Output> {
  return definition;
}

/**
 * Converts caller-local Zod input schemas to validated JSON Schema definitions.
 * @param functions - Caller-local function handlers keyed by name.
 * @returns Validated function descriptions and JSON input schemas.
 * @throws BlazingAgentsError - If a definition cannot be represented as a valid JSON Schema.
 */
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
    /** Unparseable frames naming the private event never reach the browser. */
    return null;
  }
  if ((parsed as { type?: unknown } | null)?.type !== FUNCTION_CALL_TYPE) {
    return;
  }
  return chatFunctionCallEventSchema.safeParse(parsed).data ?? null;
}

/**
 * Reads Retry-After as seconds or an HTTP date and clamps past dates to zero.
 */
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

/**
 * Returns the retry delay for transient transport or HTTP failures.
 */
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

/**
 * Waits for the delay or resolves early when the signal aborts.
 */
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
      const next = afterFailure(caught, attempt, until, signal);
      if (typeof next === "string") {
        return next;
      }
      await sleep(next, signal);
    }
  }
}

/**
 * Classifies a failed attempt as a lost race, an exhausted budget, or the delay before retrying; permanent failures rethrow.
 */
function afterFailure(
  caught: unknown,
  attempt: number,
  until: number,
  signal: AbortSignal
): "conflict" | "expired" | number {
  const error = BlazingAgentsError.isInstance(caught) ? caught : undefined;
  if (error?.status === 409) {
    return "conflict";
  }
  if (signal.aborted || Date.now() >= until) {
    return "expired";
  }
  const delay = error && retryDelayMs(error, attempt);
  if (delay === undefined) {
    throw caught;
  }
  return Date.now() + delay >= until ? "expired" : delay;
}

const invalidResult: ChatFunctionOutcome = {
  kind: "error",
  message: "Function returned an invalid result.",
};

/**
 * Resolves `undefined` when the call became late or aborted before customer code could start.
 */
async function execute(
  functions: ChatFunctions,
  { id, name, input }: ChatFunctionCallEvent["data"],
  deadline: number,
  signal: AbortSignal
): Promise<ChatFunctionOutcome | undefined> {
  const fn = Object.hasOwn(functions, name) ? functions[name] : undefined;
  if (fn === undefined) {
    return { kind: "error", message: `Function ${name} is not available.` };
  }
  /** Refinements and transforms are customer code too. */
  if (signal.aborted || Date.now() >= deadline) {
    return;
  }
  let parsed: Awaited<ReturnType<typeof fn.inputSchema.safeParseAsync>>;
  try {
    parsed = await fn.inputSchema.safeParseAsync(input);
  } catch {
    /** Zod rethrows errors thrown inside refinements and transforms. */
    return { kind: "error", message: "Invalid function input." };
  }
  if (!parsed.success) {
    return { kind: "error", message: "Invalid function input." };
  }
  if (signal.aborted || Date.now() >= deadline) {
    return;
  }
  let value: unknown;
  try {
    value = await fn.execute(parsed.data, { idempotencyKey: id, signal });
  } catch {
    return { kind: "error", message: "Function execution failed." };
  }
  try {
    /** Only plain JSON is accepted; undefined, NaN, Dates and class instances are invalid. */
    return (
      chatFunctionOutcomeSchema.safeParse({ kind: "output", value }).data ??
      invalidResult
    );
  } catch {
    /** Cyclic values fail serialization in the size check. */
    return invalidResult;
  }
}

export interface FunctionDispatchTarget {
  abortSignal?: AbortSignal;
  agentId: string;
  functions: ChatFunctions;
  sessionId: string;
}

interface FunctionEventHandlers {
  /**
   * Dispatches a function call without blocking the stream reader.
   * @param call - Private function-call event payload.
   * @param fail - Reports a dispatch failure to the stream reader.
   */
  onCall?(
    call: ChatFunctionCallEvent["data"],
    fail: (error: unknown) => void
  ): void;
  /**
   * Handles consumer cancellation.
   */
  onCancel?(): void;
  /**
   * Stops function handlers when the upstream stream ends.
   */
  onEnd?(): void;
}

/**
 * Reads native SSE eagerly and returns it without private function events,
 * so slow consumers never delay a call. A recognized but malformed event
 * fails the stream.
 * @param body - Upstream SSE byte stream.
 */
export function stripFunctionEvents(
  body: ReadableStream<Uint8Array>,
  { onCall, onCancel, onEnd }: FunctionEventHandlers = {}
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let output!: ReadableStreamDefaultController<Uint8Array>;
  let finished = false;

  /**
   * Fails the output stream once and cancels its upstream reader.
   */
  const fail = (error: unknown) => {
    if (finished) {
      return;
    }
    finished = true;
    output.error(error);
    reader.cancel(error).catch(() => undefined);
  };

  /**
   * Forwards public SSE blocks and dispatches or rejects private function events.
   */
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
    } else {
      onCall?.(call.data, fail);
    }
  };

  /**
   * Reads SSE bytes eagerly and splits complete event blocks for dispatch.
   */
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
      onEnd?.();
    }
  };

  return new ReadableStream<Uint8Array>({
    /**
     * Initializes the stream controller.
     */
    start(controller) {
      output = controller;
      pump();
    },
    /**
     * Cancels the upstream reader with the consumer reason.
     */
    async cancel(reason) {
      finished = true;
      onCancel?.();
      await reader.cancel(reason);
    },
  });
}

/**
 * Strips private function events and executes claimed calls without blocking the read loop.
 * @param config - Authentication, base URL, and transport configuration.
 * @param target - Agent, Session, local handlers, and caller cancellation signal.
 * @param body - Upstream SSE byte stream.
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
  /**
   * Aborts pending function claims and retries.
   */
  const abort = () => stop.abort();
  stop.signal.addEventListener("abort", () => handlers.abort(), {
    once: true,
  });
  target.abortSignal?.addEventListener("abort", abort, { once: true });
  if (target.abortSignal?.aborted) {
    abort();
  }
  const dispatched = new Set<string>();

  /**
   * Claims a function call, runs its handler, and posts the result within its retry budget.
   */
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
    /**
     * A grant can arrive just before the deadline and be processed after it,
     * or after abort; `execute` rechecks immediately before customer code.
     */
    const outcome = await execute(
      target.functions,
      call,
      deadline,
      AbortSignal.any([
        handlers.signal,
        AbortSignal.timeout(Math.max(0, deadline - Date.now())),
      ])
    );
    if (outcome === undefined) {
      return;
    }
    await postWithRetry(
      config,
      `${path}/result`,
      { claimRequestId, outcome },
      resolveChatFunctionResponseSchema,
      deadline + RESULT_RETRY_GRACE_MS,
      stop.signal
    );
  };

  return stripFunctionEvents(body, {
    /**
     * Dispatches a function call without blocking the stream reader.
     */
    onCall(call, fail) {
      if (!dispatched.has(call.id)) {
        dispatched.add(call.id);
        runCall(call).catch(fail);
      }
    },
    onCancel: abort,
    /**
     * Stops function handlers when the upstream stream ends.
     */
    onEnd() {
      handlers.abort();
      target.abortSignal?.removeEventListener("abort", abort);
    },
  });
}
