import {
  type ChatTransport,
  DefaultChatTransport,
  type HttpChatTransportInitOptions,
  type UIMessage,
} from "ai";
import { sessionIdSchema } from "./contracts/ids.ts";

export type BlazingAgentsChatTransportOptions<
  UI_MESSAGE extends UIMessage = UIMessage,
> = Omit<
  HttpChatTransportInitOptions<UI_MESSAGE>,
  "prepareReconnectToStreamRequest" | "prepareSendMessagesRequest"
> & {
  /** Receives the Session ID minted by the first successful response. */
  onSessionId?: (sessionId: string) => Promise<void> | void;
  /** An authorized Session ID used to resume after a remount or reload. */
  sessionId?: string;
};

/**
 * Adapts AI SDK chat requests to the Blazing Agents backend-relay shape and
 * resumes with the server-minted Session ID returned in `Location`.
 */
export class BlazingAgentsChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> implements ChatTransport<UI_MESSAGE>
{
  readonly #transport: DefaultChatTransport<UI_MESSAGE>;
  #sessionId: string | undefined;

  constructor(options: BlazingAgentsChatTransportOptions<UI_MESSAGE> = {}) {
    const { onSessionId, sessionId, ...transportOptions } = options;
    const transportFetch = transportOptions.fetch ?? globalThis.fetch;
    this.#sessionId =
      sessionId === undefined ? undefined : sessionIdSchema.parse(sessionId);
    this.#transport = new DefaultChatTransport({
      ...transportOptions,
      fetch: async (input, init) => {
        const response = await transportFetch(input, init);
        if (response.ok && this.#sessionId === undefined) {
          try {
            const location = response.headers.get("location");
            const candidate = location?.split("/").pop();
            this.#sessionId = sessionIdSchema.parse(candidate);
            await onSessionId?.(this.#sessionId);
          } catch (error) {
            await response.body?.cancel(error).catch(() => undefined);
            throw error;
          }
        }
        return response;
      },
      prepareSendMessagesRequest: ({ body, messageId, messages, trigger }) => {
        const message = messages.findLast(
          (candidate) => candidate.role === "user"
        );
        if (!message) {
          throw new Error("Chat submission requires a user message.");
        }
        return {
          body: {
            ...body,
            message,
            messageId,
            ...(this.#sessionId === undefined
              ? { sessionId: undefined }
              : { sessionId: this.#sessionId }),
            trigger,
          },
        };
      },
    });
  }

  sendMessages(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]
  ): Promise<ReadableStream<import("ai").UIMessageChunk>> {
    return this.#transport.sendMessages(input);
  }

  reconnectToStream(
    _input: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0]
  ): Promise<null> {
    return Promise.resolve(null);
  }
}
