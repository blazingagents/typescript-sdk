import { BlazingAgentsChat } from "@blazingagents/sdk";
import { expect, it, vi } from "vitest";

it("runs the installed chat with the consumer's AI SDK, outside any UI framework", async () => {
  const chunks = [
    { type: "start", messageId: "reply-1" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "Hi there" },
    { type: "text-end", id: "text-1" },
    { type: "finish", finishReason: "stop" },
  ];
  const chat = new BlazingAgentsChat({
    storageKey: null,
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
  const listener = vi.fn();
  chat.subscribe(listener);
  chat.start();
  await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));

  expect(await chat.send("Hello")).toBe(true);

  expect(listener).toHaveBeenCalled();
  expect(chat.getSnapshot()).toMatchObject({
    sessionId: "ss_0123456789abcdef",
    status: "idle",
  });
  expect(chat.getSnapshot().messages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
  ]);
  chat.dispose();
});
