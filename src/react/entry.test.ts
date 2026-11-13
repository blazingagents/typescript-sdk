import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => {
  throw new Error("the react package is not installed");
});

describe("entries without React", () => {
  it("reads history through the root entry's chat transport", async () => {
    const { BlazingAgentsChatTransport } = await import("../index.ts");
    const transport = new BlazingAgentsChatTransport({
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: [
              { id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] },
            ],
            nextCursor: null,
          })
        ),
      sessionId: "ss_0123456789abcdef",
    });

    expect(await transport.loadHistory()).toHaveLength(1);
  });

  it("starts the root entry's chat", async () => {
    const { BlazingAgentsChat } = await import("../index.ts");
    const chat = new BlazingAgentsChat({ storageKey: null });

    chat.start();

    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    chat.dispose();
  });

  it("builds the REST client", async () => {
    const { BlazingAgentsRest } = await import("../rest.ts");

    expect(new BlazingAgentsRest({ apiKey: "ba_test" }).agents).toBeDefined();
  });
});
