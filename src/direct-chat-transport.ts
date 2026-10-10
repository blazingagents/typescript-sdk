import {
  type ChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { extractApprovalDecisions } from "./approvals.ts";
import { ChatStreamTransport } from "./chat-stream-transport.ts";
import type { BlazingAgents } from "./client.ts";
import { sessionIdSchema } from "./contracts/ids.ts";
import type { ChatFunctions } from "./functions.ts";
import type { ChatResult } from "./types.ts";

export type BlazingAgentsDirectChatTransportOptions = {
  agentId: string;
  /** Caller-local functions for every Turn and approved continuation of this chat. */
  functions?: ChatFunctions;
  /**
   * Returns the authenticated SDK client for the current request.
   * @returns The SDK client for this request.
   */
  getClient: () => BlazingAgents | Promise<BlazingAgents>;
  metadata?: Record<string, unknown>;
  /**
   * Receives the Session ID before the response stream is consumed.
   * @param sessionId - Session to look up or record.
   */
  onSessionId?: (sessionId: string) => Promise<void> | void;
  /**
   * Receives the running Turn ID before the response stream is consumed.
   * Pass it to Stop.
   * @param turnId - Turn the response runs.
   */
  onTurnId?: (turnId: string) => Promise<void> | void;
  sessionId?: string;
  userId?: string;
} & (
  | { promptId: string; variables?: Record<string, string> }
  | { promptId?: never; variables?: never }
);

/** Connects useChat directly to the SDK, including native streaming fetch clients. */
export class BlazingAgentsDirectChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends ChatStreamTransport<UI_MESSAGE> {
  readonly #options: BlazingAgentsDirectChatTransportOptions;
  #sessionId: string | undefined;

  /**
   * Creates a chat transport and validates any supplied Session ID.
   * @param options - Configuration for this operation.
   */
  constructor(options: BlazingAgentsDirectChatTransportOptions) {
    super();
    this.#options = options;
    this.#sessionId =
      options.sessionId === undefined
        ? undefined
        : sessionIdSchema.parse(options.sessionId);
  }

  /**
   * Submits the supplied user messages directly to the SDK chat endpoint.
   * @param input - Operation input and optional cancellation signal.
   * @returns The decoded AI SDK message-chunk stream.
   */
  async sendUserMessages(input: {
    messages: UI_MESSAGE[];
    abortSignal?: AbortSignal;
  }) {
    const client = await this.#options.getClient();
    const result = await client.chat({
      ...input,
      agentId: this.#options.agentId,
      sessionId: this.#sessionId,
      functions: this.#options.functions,
      userId: this.#options.userId,
      metadata: this.#options.metadata,
    });
    return this.#processChatResult(result);
  }

  /**
   * Submits the latest user message or complete assistant approval round to the chat.
   * @param input - Operation input and optional cancellation signal.
   * @returns The decoded AI SDK message-chunk stream.
   */
  override async sendMessages(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]
  ) {
    if (input.trigger === "regenerate-message" && !this.#sessionId) {
      throw new Error("Regeneration requires an existing Session.");
    }
    const last = input.messages.at(-1);
    if (
      last?.role === "assistant" &&
      lastAssistantMessageIsCompleteWithApprovalResponses({
        messages: input.messages,
      })
    ) {
      return await this.#sendApprovalContinuation(input, last);
    }

    const client = await this.#options.getClient();
    const common = {
      agentId: this.#options.agentId,
      functions: this.#options.functions,
      messageId: input.messageId,
      abortSignal: input.abortSignal,
    };
    let result: ChatResult;
    if (this.#sessionId === undefined) {
      const create = {
        ...common,
        trigger: "submit-message" as const,
        userId: this.#options.userId,
        metadata: this.#options.metadata,
      };
      if (this.#options.promptId === undefined) {
        const message = input.messages.findLast((item) => item.role === "user");
        if (!message) {
          throw new Error("Chat submission requires a user message.");
        }
        result = await client.chat({ ...create, message });
      } else {
        result = await client.chat({
          ...create,
          promptId: this.#options.promptId,
          variables: this.#options.variables,
        });
      }
    } else {
      const message = input.messages.findLast((item) => item.role === "user");
      if (!message) {
        throw new Error("Chat submission requires a user message.");
      }
      result = await client.chat({
        ...common,
        message,
        sessionId: this.#sessionId,
        trigger: input.trigger,
      });
    }
    return this.#processChatResult(result);
  }

  /**
   * Claims the chat stream and records the first Session ID and the Turn ID
   * before decoding chunks.
   */
  async #processChatResult(result: ChatResult) {
    const stream = result.toStream();
    try {
      const sessionId = await result.sessionId;
      if (this.#sessionId === undefined) {
        this.#sessionId = sessionId;
        await this.#options.onSessionId?.(sessionId);
      }
      await this.#reportTurnId(result);
    } catch (error) {
      await stream.cancel(error).catch(() => undefined);
      throw error;
    }
    return this.processResponseStream(stream);
  }

  /**
   * Returns null because reconnecting to an existing stream is unsupported.
   * @param _input - Unused reconnect request.
   * @returns A promise resolving to null.
   */
  override reconnectToStream(
    _input: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0]
  ) {
    return Promise.resolve(null);
  }

  /**
   * Submits the last assistant approval round for the existing Session.
   * @param input - Operation input and optional cancellation signal.
   */
  async #sendApprovalContinuation(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0],
    last: UI_MESSAGE
  ) {
    if (this.#sessionId === undefined) {
      throw new Error("Tool approval requires an existing Session.");
    }
    const client = await this.#options.getClient();
    const target = {
      agentId: this.#options.agentId,
      sessionId: this.#sessionId,
      abortSignal: input.abortSignal,
    };
    const decisions = extractApprovalDecisions(last);
    const continuation = await client.continueChat({
      ...target,
      decisions,
      functions: this.#options.functions ?? {},
    });
    const stream = continuation.toStream();
    try {
      await this.#reportTurnId(continuation);
    } catch (error) {
      await stream.cancel(error).catch(() => undefined);
      throw error;
    }
    return this.processResponseStream(stream);
  }

  /** Reports the Turn ID when the response names one. */
  async #reportTurnId(result: ChatResult) {
    const turnId = await result.turnId.catch(() => undefined);
    if (turnId !== undefined) {
      await this.#options.onTurnId?.(turnId);
    }
  }
}
