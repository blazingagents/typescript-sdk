import {
  type ChatTransport,
  type HttpChatTransportInitOptions,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  safeValidateUIMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import type { z } from "zod";
import {
  type RelayRequestBody,
  relayHistoryPageSchema,
  relaySteerReceiptSchema,
} from "./chat-relay-wire.ts";
import { ChatStreamTransport } from "./chat-stream-transport.ts";
import { chatSteerConsumedEventSchema } from "./contracts/entities/session-inputs.ts";
import { sessionIdSchema, turnIdSchema } from "./contracts/ids.ts";
import { BlazingAgentsError, parseClientInput } from "./errors.ts";
import {
  errorFromResponse,
  invalidResponseError,
  sendRequest,
} from "./http.ts";

/** At most this many history pages (of 200 messages) are read. */
const HISTORY_PAGE_LIMIT = 50;

export type BlazingAgentsChatTransportOptions<
  UI_MESSAGE extends UIMessage = UIMessage,
> = Omit<
  HttpChatTransportInitOptions<UI_MESSAGE>,
  "prepareReconnectToStreamRequest" | "prepareSendMessagesRequest"
> & {
  /**
   * Receives the Session ID minted by the first successful response.
   * @param sessionId - Session to look up or record.
   */
  onSessionId?: (sessionId: string) => Promise<void> | void;
  /**
   * Called when the running Turn reads a steered message, from the transient
   * `data-ba-steer-consumed` chunk. The chunk still reaches `Chat` as a
   * transient data part.
   * @param requestId - The steer's request ID.
   */
  onSteerConsumed?: (requestId: string) => void;
  /**
   * Called when the running Turn's stream carries its `finish` chunk. A
   * stream that ends without one, by Stop, a server `abort`, an error, or a
   * dropped connection, did not complete, though the Turn may have stored its
   * messages before it ended.
   */
  onTurnFinish?: () => void;
  /**
   * Receives the running Turn ID from each response that names one, before
   * its stream is consumed. Pass it to Stop.
   * @param turnId - Turn the response runs.
   */
  onTurnId?: (turnId: string) => Promise<void> | void;
  /**
   * Called when the relay answers a chat request with a stream, before any
   * chunk is read. From then on the Turn accepts steers.
   */
  onTurnStart?: () => void;
  /** An authorized Session ID used to resume after a remount or reload. */
  sessionId?: string;
};

/**
 * What a steer did, folded into what the caller does next:
 * - `accepted`: the running Turn holds it and may still read it.
 * - `committed`: it is stored with that Turn's history.
 * - `resend`: it will never reach this Turn (its receipt is `not_placed`, or
 *   the relay answered 409 `steer_not_available`); send it as ordinary chat.
 */
export type SteerOutcome = "accepted" | "committed" | "resend";

type Resolvable<T> = T | PromiseLike<T> | (() => T | PromiseLike<T>);

/**
 * Adapts AI SDK chat requests to the Blazing Agents relay, resumes with the
 * server-minted Session ID returned in `Location`, and reads history and
 * steers through the same relay endpoint.
 */
export class BlazingAgentsChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> implements ChatTransport<UI_MESSAGE>
{
  readonly #api: string;
  readonly #body: Resolvable<object> | undefined;
  readonly #credentials: Resolvable<RequestCredentials> | undefined;
  readonly #fetch: typeof globalThis.fetch;
  readonly #headers: Resolvable<Record<string, string> | Headers> | undefined;
  readonly #onSteerConsumed: ((requestId: string) => void) | undefined;
  readonly #onTurnFinish: (() => void) | undefined;
  readonly #transport: ChatStreamTransport<UI_MESSAGE>;
  #sessionId: string | undefined;

  /**
   * Creates a chat transport and validates any supplied Session ID.
   * @param options - Configuration for this operation.
   */
  constructor(options: BlazingAgentsChatTransportOptions<UI_MESSAGE> = {}) {
    const {
      onSessionId,
      onSteerConsumed,
      onTurnFinish,
      onTurnId,
      onTurnStart,
      sessionId,
      ...transportOptions
    } = options;
    const transportFetch = transportOptions.fetch ?? globalThis.fetch;
    this.#api = transportOptions.api ?? "/api/chat";
    this.#body = transportOptions.body;
    this.#credentials = transportOptions.credentials;
    this.#fetch = transportFetch;
    this.#headers = transportOptions.headers;
    this.#onSteerConsumed = onSteerConsumed;
    this.#onTurnFinish = onTurnFinish;
    this.#sessionId =
      sessionId === undefined
        ? undefined
        : parseClientInput(sessionIdSchema, sessionId, "sessionId");
    this.#transport = new ChatStreamTransport({
      ...transportOptions,
      /** Throws a relay error as a `BlazingAgentsError`, and reads the first Session ID and each Turn ID before returning the response. */
      fetch: async (input, init) => {
        const response = await transportFetch(input, init);
        if (!response.ok) {
          throw await errorFromResponse(response, init?.signal ?? undefined);
        }
        try {
          if (this.#sessionId === undefined) {
            const location = response.headers.get("location");
            const candidate = location?.split("/").pop();
            this.#sessionId = sessionIdSchema.parse(candidate);
            await onSessionId?.(this.#sessionId);
          }
          const turnId = turnIdSchema.safeParse(
            response.headers.get("x-ba-turn-id")
          );
          if (turnId.success) {
            await onTurnId?.(turnId.data);
          }
        } catch (error) {
          await response.body?.cancel(error).catch(() => undefined);
          throw error;
        }
        onTurnStart?.();
        return response;
      },
      /** Selects the user message or complete approval round for the relay request. */
      prepareSendMessagesRequest: ({ body, messageId, messages, trigger }) => {
        const approvals =
          messages.at(-1)?.role === "assistant" &&
          lastAssistantMessageIsCompleteWithApprovalResponses({ messages });
        if (approvals && this.#sessionId === undefined) {
          throw new Error("Tool approval requires an existing Session.");
        }
        const message = approvals
          ? messages.at(-1)
          : messages.findLast((candidate) => candidate.role === "user");
        if (!message) {
          throw new Error("Chat submission requires a user message.");
        }
        const request: Extract<RelayRequestBody, { op: "chat" }> = {
          op: "chat",
          message,
          messageId,
          sessionId: this.#sessionId,
          trigger,
        };
        return { body: { ...body, ...request } };
      },
    });
  }

  /** The Session this transport talks to: the supplied one, or the one the first chat minted. */
  get sessionId(): string | undefined {
    return this.#sessionId;
  }

  /**
   * Submits the latest user message or complete assistant approval round to the chat.
   * @param input - Operation input and optional cancellation signal.
   * @returns The decoded AI SDK message-chunk stream.
   */
  async sendMessages(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    const onSteerConsumed = this.#onSteerConsumed;
    const onTurnFinish = this.#onTurnFinish;
    const stream = await this.#transport.sendMessages(input);
    return stream.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (chunk.type === "finish") {
            onTurnFinish?.();
          }
          if (chunk.type === "data-ba-steer-consumed") {
            const steer = chatSteerConsumedEventSchema.safeParse(chunk);
            if (steer.success) {
              onSteerConsumed?.(steer.data.data.requestId);
            }
          }
          controller.enqueue(chunk);
        },
      })
    );
  }

  /**
   * Returns null because reconnecting to an existing stream is unsupported.
   * @param _input - Unused reconnect request.
   * @returns A promise resolving to null.
   */
  reconnectToStream(
    _input: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0]
  ): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Reads the Session's stored transcript through the relay, oldest first.
   * Pages are read newest first. With `known`, the read stops at the first
   * page whose oldest message is in `known`, and the known messages before
   * that one complete the transcript, so a transcript that changed only near
   * its end costs one request.
   * @param options - `known`: messages already known to be stored, oldest first. Optional cancellation signal.
   * @returns The stored messages, validated as `UIMessage`s; empty without a Session.
   * @throws BlazingAgentsError - The relay's error, such as 404 `not_found` when the Session is gone or belongs to another End-user; `invalid_response` when a page or message is malformed; `network_error` or `request_aborted` when the request fails.
   */
  async loadHistory(
    options: { abortSignal?: AbortSignal; known?: readonly UI_MESSAGE[] } = {}
  ): Promise<UI_MESSAGE[]> {
    const sessionId = this.#sessionId;
    if (sessionId === undefined) {
      return [];
    }
    const { abortSignal, known = [] } = options;
    const pages: UI_MESSAGE[][] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let kept: readonly UI_MESSAGE[] = [];
    do {
      const page = await this.#post(
        { op: "history", sessionId, cursor },
        relayHistoryPageSchema,
        abortSignal
      );
      const messages = await validateHistory<UI_MESSAGE>(page.data);
      pages.unshift(messages);
      const oldest = known.findIndex(
        (message) => message.id === messages[0]?.id
      );
      if (oldest !== -1) {
        kept = known.slice(0, oldest);
        break;
      }
      if (page.nextCursor === null || cursors.has(page.nextCursor)) {
        break;
      }
      cursor = page.nextCursor;
      cursors.add(cursor);
    } while (pages.length < HISTORY_PAGE_LIMIT);
    const read = pages.flat();
    const readIds = new Set(read.map((message) => message.id));
    return [
      ...kept.filter((message) => !readIds.has(message.id)),
      // A Turn that commits while the pages are read can repeat a message on two pages.
      ...new Map(read.map((message) => [message.id, message])).values(),
    ];
  }

  /**
   * Sends one user message into the Turn running now. Retrying with the same
   * `requestId` and message replays the receipt.
   * @param input - The user message, its steer request ID, and an optional cancellation signal.
   * @returns What the steer did; see `SteerOutcome`.
   * @throws BlazingAgentsError - `invalid_request` without a Session; the relay's error, such as 409 `input_idempotency_conflict`; `network_error` when the answer was lost.
   */
  async steer(input: {
    abortSignal?: AbortSignal;
    message: UI_MESSAGE & { role: "user" };
    requestId: string;
  }): Promise<SteerOutcome> {
    const sessionId = this.#sessionId;
    if (sessionId === undefined) {
      throw new BlazingAgentsError({
        code: "invalid_request",
        message: "Steering requires an existing Session.",
      });
    }
    try {
      const receipt = await this.#post(
        {
          op: "steer",
          sessionId,
          requestId: input.requestId,
          message: input.message,
        },
        relaySteerReceiptSchema,
        input.abortSignal
      );
      return receipt.state === "not_placed" ? "resend" : receipt.state;
    } catch (error) {
      if (
        BlazingAgentsError.isInstance(error) &&
        error.code === "steer_not_available"
      ) {
        return "resend";
      }
      throw error;
    }
  }

  /** POSTs one JSON op to the relay with the transport's headers, credentials, and body extras. */
  async #post<Schema extends z.ZodType>(
    request: RelayRequestBody,
    schema: Schema,
    abortSignal: AbortSignal | undefined
  ): Promise<z.output<Schema>> {
    const [extras, headers, credentials] = await Promise.all([
      resolveOption(this.#body),
      resolveOption(this.#headers),
      resolveOption(this.#credentials),
    ]);
    const requestHeaders = new Headers(headers);
    requestHeaders.set("content-type", "application/json");
    const response = await sendRequest(this.#fetch, this.#api, {
      body: JSON.stringify({ ...extras, ...request }),
      credentials,
      headers: requestHeaders,
      method: "POST",
      signal: abortSignal,
    });
    if (!response.ok) {
      throw await errorFromResponse(response, abortSignal);
    }
    const text = await response.text();
    try {
      return schema.parse(JSON.parse(text));
    } catch (cause) {
      throw invalidResponseError(
        response.headers,
        response.status,
        text,
        false,
        cause
      );
    }
  }
}

async function validateHistory<UI_MESSAGE extends UIMessage>(
  messages: unknown[]
): Promise<UI_MESSAGE[]> {
  if (messages.length === 0) {
    return [];
  }
  const validated = await safeValidateUIMessages<UI_MESSAGE>({ messages });
  if (!validated.success) {
    throw new BlazingAgentsError(
      {
        code: "invalid_response",
        message: "The relay returned a malformed history message.",
      },
      { cause: validated.error }
    );
  }
  return validated.data;
}

function resolveOption<T>(value: Resolvable<T>): Promise<T> {
  return Promise.resolve(
    typeof value === "function" ? (value as () => T | PromiseLike<T>)() : value
  );
}
