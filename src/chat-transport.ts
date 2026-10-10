import {
  type ChatTransport,
  type HttpChatTransportInitOptions,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { ChatStreamTransport } from "./chat-stream-transport.ts";
import { sessionIdSchema, turnIdSchema } from "./contracts/ids.ts";

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
   * Receives the running Turn ID from each response that names one, before
   * its stream is consumed. Pass it to Stop.
   * @param turnId - Turn the response runs.
   */
  onTurnId?: (turnId: string) => Promise<void> | void;
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
  readonly #transport: ChatStreamTransport<UI_MESSAGE>;
  #sessionId: string | undefined;

  /**
   * Creates a chat transport and validates any supplied Session ID.
   * @param options - Configuration for this operation.
   */
  constructor(options: BlazingAgentsChatTransportOptions<UI_MESSAGE> = {}) {
    const { onSessionId, onTurnId, sessionId, ...transportOptions } = options;
    const transportFetch = transportOptions.fetch ?? globalThis.fetch;
    this.#sessionId =
      sessionId === undefined ? undefined : sessionIdSchema.parse(sessionId);
    this.#transport = new ChatStreamTransport({
      ...transportOptions,
      /** Reads the first Session ID and each Turn ID before returning the response. */
      fetch: async (input, init) => {
        const response = await transportFetch(input, init);
        if (!response.ok) {
          return response;
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

  /**
   * Submits the latest user message or complete assistant approval round to the chat.
   * @param input - Operation input and optional cancellation signal.
   * @returns The decoded AI SDK message-chunk stream.
   */
  sendMessages(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]
  ): Promise<ReadableStream<import("ai").UIMessageChunk>> {
    return this.#transport.sendMessages(input);
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
}
