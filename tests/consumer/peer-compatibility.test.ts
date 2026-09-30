import {
  BlazingAgents,
  BlazingAgentsChatTransport,
  BlazingAgentsDirectChatTransport,
  type BlazingAgentsUIMessage,
} from "@blazingagents/sdk";
import { taskOnceConfigSchema } from "@blazingagents/sdk/contracts";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { expect, it } from "vitest";
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
