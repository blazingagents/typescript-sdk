import { type ChatTransport, DefaultChatTransport, type UIMessage } from "ai";
import type { BlazingAgents } from "./client.ts";
import { sessionIdSchema } from "./contracts/ids.ts";

export interface BlazingAgentsDirectChatTransportOptions {
  agentId: string;
  client: BlazingAgents;
  /** Receives the Session ID before the response stream is consumed. */
  onSessionId?: (sessionId: string) => Promise<void> | void;
  sessionId?: string;
}

/** Connects useChat directly to the SDK, including native streaming fetch clients. */
export class BlazingAgentsDirectChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends DefaultChatTransport<UI_MESSAGE> {
  readonly #options: BlazingAgentsDirectChatTransportOptions;
  #sessionId: string | undefined;

  constructor(options: BlazingAgentsDirectChatTransportOptions) {
    super();
    this.#options = options;
    this.#sessionId =
      options.sessionId === undefined
        ? undefined
        : sessionIdSchema.parse(options.sessionId);
  }

  override async sendMessages(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]
  ) {
    if (input.trigger === "regenerate-message" && !this.#sessionId) {
      throw new Error("Regeneration requires an existing Session.");
    }
    const message = input.messages.findLast((item) => item.role === "user");
    if (!message) {
      throw new Error("Chat submission requires a user message.");
    }
    const result = await this.#options.client.chat({
      agentId: this.#options.agentId,
      message,
      messageId: input.messageId,
      ...(this.#sessionId === undefined
        ? { trigger: "submit-message" as const }
        : { sessionId: this.#sessionId, trigger: input.trigger }),
      abortSignal: input.abortSignal,
    });
    const stream = result.toStream();
    try {
      const sessionId = await result.sessionId;
      if (this.#sessionId === undefined) {
        this.#sessionId = sessionId;
        await this.#options.onSessionId?.(sessionId);
      }
    } catch (error) {
      await stream.cancel(error).catch(() => undefined);
      throw error;
    }
    return this.processResponseStream(stream);
  }

  override reconnectToStream(
    _input: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0]
  ): Promise<null> {
    return Promise.resolve(null);
  }
}
