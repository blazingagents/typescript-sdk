import {
  BlazingAgents,
  BlazingAgentsChatTransport,
  BlazingAgentsDirectChatTransport,
  type BlazingAgentsUIMessage,
  type BlazingAgentsUIMessageChunk,
  type ChatSteerConsumedEvent,
  type SpendingLimitStopEvent,
} from "@blazingagents/sdk";
import { taskOnceConfigSchema } from "@blazingagents/sdk/contracts";
import {
  AbstractChat,
  type ChatState,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { expect, it, vi } from "vitest";
import { z } from "zod";

it("composes exported schemas with the consumer's Zod", () => {
  const schema = z.union([
    taskOnceConfigSchema,
    z.object({ manual: z.literal(true) }),
  ]);
  const scheduled = { at: "2026-10-01T12:00:00Z" };
  const manual: z.infer<typeof schema> = { manual: true };

  expect(schema.parse(scheduled)).toEqual(scheduled);
  expect(schema.parse(manual)).toEqual(manual);
  expect(schema.safeParse({ at: "invalid" }).success).toBe(false);
});

it("uses the consumer's AI transport and message contracts", async () => {
  const message: BlazingAgentsUIMessage = {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
  };
  const consumerMessage = message satisfies UIMessage;
  const chunks: UIMessageChunk[] = [
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "Hello consumer" },
    { type: "text-end", id: "text-1" },
  ];
  const transport: ChatTransport<BlazingAgentsUIMessage> =
    new BlazingAgentsChatTransport({
      fetch: () =>
        Promise.resolve(
          new Response(
            `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
            {
              headers: {
                "content-type": "text/event-stream",
                location:
                  "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef",
              },
            }
          )
        ),
    });
  const stream = await transport.sendMessages({
    chatId: "chat-1",
    messages: [consumerMessage],
    trigger: "submit-message",
    abortSignal: undefined,
    messageId: undefined,
  });
  const received: UIMessageChunk[] = [];
  for await (const chunk of stream) {
    received.push(chunk);
  }

  expect(received).toEqual(chunks);

  const direct: ChatTransport<BlazingAgentsUIMessage> =
    new BlazingAgentsDirectChatTransport({
      getClient: () => new BlazingAgents({ apiKey: "ba_consumer_contract" }),
      agentId: "ag_0123456789abcdef",
    });
  expect(await direct.reconnectToStream({ chatId: "chat-1" })).toBeNull();
});

it.each(["direct", "relay"])(
  "handles steer consumption and a spending stop in the consumer's native AI Chat (%s)",
  async (kind) => {
    const steerEvent: ChatSteerConsumedEvent = {
      type: "data-ba-steer-consumed",
      transient: true,
      data: {
        requestId: "steer-1",
        turnId: "tr_0123456789abcdef",
        sequence: 1,
        message: {
          id: "steer-message",
          role: "user",
          parts: [{ type: "text", text: "Focus on the tests" }],
        },
      },
    };
    const event: SpendingLimitStopEvent = {
      type: "data-model-spending-limit",
      transient: true,
      data: {
        code: "model_spending_limit_exceeded",
        scope: "tenant",
        reason: "exhausted",
        spentUsd: 5,
        reservedUsd: 0,
        availableUsd: 0,
        nextResetAt: null,
      },
    };
    const chunks: BlazingAgentsUIMessageChunk[] = [
      { type: "start", messageId: "answer" },
      { type: "text-start", id: "text" },
      { type: "text-delta", id: "text", delta: "Completed work" },
      { type: "text-end", id: "text" },
      steerEvent,
      event,
      { type: "error", errorText: "Tenant model spending limit reached." },
      { type: "finish", finishReason: "error" },
    ];
    const steerRequestIds: string[] = chunks
      .filter((chunk) => chunk.type === "data-ba-steer-consumed")
      .map((chunk) => chunk.data.requestId);
    const spendingStopCodes: "model_spending_limit_exceeded"[] = chunks
      .filter((chunk) => chunk.type === "data-model-spending-limit")
      .map((chunk) => chunk.data.code);
    expect(steerRequestIds).toEqual([steerEvent.data.requestId]);
    expect(spendingStopCodes).toEqual([event.data.code]);
    const fetch = () =>
      Promise.resolve(
        new Response(
          `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`
        )
      );
    const sessionId = "ss_0123456789abcdef";
    const transport: ChatTransport<BlazingAgentsUIMessage> =
      kind === "direct"
        ? new BlazingAgentsDirectChatTransport({
            agentId: "ag_0123456789abcdef",
            sessionId,
            getClient: () => new BlazingAgents({ apiKey: "ba_test", fetch }),
          })
        : new BlazingAgentsChatTransport({ sessionId, fetch });
    const state: ChatState<BlazingAgentsUIMessage> = {
      messages: [],
      status: "ready",
      error: undefined,
      pushMessage(message) {
        this.messages.push(message);
      },
      popMessage() {
        this.messages.pop();
      },
      replaceMessage(index, message) {
        this.messages[index] = message;
      },
      snapshot: structuredClone,
    };
    class TestChat extends AbstractChat<BlazingAgentsUIMessage> {}
    const onError = vi.fn();
    const onFinish = vi.fn();
    const data: SpendingLimitStopEvent["data"][] = [];
    const consumedSteers: ChatSteerConsumedEvent["data"][] = [];
    const chat = new TestChat({
      state,
      transport,
      onError,
      onFinish,
      onData(chunk) {
        if (chunk.type === "data-ba-steer-consumed") {
          consumedSteers.push(chunk.data);
        } else if (chunk.type === "data-model-spending-limit") {
          data.push(chunk.data);
        }
      },
    });
    await chat.sendMessage({ text: "Run" });
    expect(chat.status).toBe("error");
    expect(onError).toHaveBeenCalledWith(
      new Error("Tenant model spending limit reached.")
    );
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isError: true, finishReason: undefined })
    );
    expect(consumedSteers).toEqual([steerEvent.data]);
    expect(data).toEqual([event.data]);
    expect(chat.messages.at(-1)?.parts).toEqual([
      {
        type: "text",
        text: "Completed work",
        state: "done",
        providerMetadata: undefined,
      },
    ]);
  }
);
