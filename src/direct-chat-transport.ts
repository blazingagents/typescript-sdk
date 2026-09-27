import {
  type ChatTransport,
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import type { BlazingAgents } from "./client.ts";
import { sessionIdSchema } from "./contracts/ids.ts";
import type { ChatResult } from "./types.ts";

export type BlazingAgentsDirectChatTransportOptions = {
  agentId: string;
  getClient: () => BlazingAgents | Promise<BlazingAgents>;
  metadata?: Record<string, unknown>;
  /** Receives the Session ID before the response stream is consumed. */
  onSessionId?: (sessionId: string) => Promise<void> | void;
  sessionId?: string;
  userId?: string;
  version?: number;
} & (
  | { promptId: string; variables?: Record<string, string> }
  | { promptId?: never; variables?: never }
);

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
      messageId: input.messageId,
      abortSignal: input.abortSignal,
    };
    let result: ChatResult;
    if (this.#sessionId === undefined) {
      const create = {
        ...common,
        trigger: "submit-message" as const,
        version: this.#options.version,
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

  override async reconnectToStream(
    _input: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0]
  ) {
    if (this.#sessionId === undefined) {
      return null;
    }
    const { continuation } = await (
      await this.#options.getClient()
    ).sessions.toolApprovals({
      agentId: this.#options.agentId,
      sessionId: this.#sessionId,
    });
    if (continuation?.state !== "queued" && continuation?.state !== "running") {
      return null;
    }
    const result = await (
      await this.#options.getClient()
    ).sessions.joinToolApprovalContinuation({
      agentId: this.#options.agentId,
      sessionId: this.#sessionId,
      continuationId: continuation.id,
    });
    return this.processResponseStream(result.toStream());
  }

  async #sendApprovalContinuation(
    input: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0],
    last: UI_MESSAGE
  ) {
    if (this.#sessionId === undefined) {
      throw new Error("Tool approval requires an existing Session.");
    }
    const lastStep = last.parts.findLastIndex(
      (part) => part.type === "step-start"
    );
    let continuationId: string | undefined;
    for (const part of last.parts.slice(lastStep + 1)) {
      if (isToolUIPart(part) && part.state === "approval-responded") {
        const decision = await (
          await this.#options.getClient()
        ).sessions.decideToolApproval({
          agentId: this.#options.agentId,
          sessionId: this.#sessionId,
          approvalId: part.approval.id,
          approved: part.approval.approved,
          reason: part.approval.reason,
          abortSignal: input.abortSignal,
        });
        continuationId = decision.continuationId;
      }
    }
    if (continuationId === undefined) {
      throw new Error("Tool approval response is missing an approval.");
    }
    const continuation = await (
      await this.#options.getClient()
    ).sessions.joinToolApprovalContinuation({
      agentId: this.#options.agentId,
      sessionId: this.#sessionId,
      continuationId,
      abortSignal: input.abortSignal,
    });
    return this.processResponseStream(continuation.toStream());
  }
}
