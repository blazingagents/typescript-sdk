import { describe, expect, it } from "vitest";
import { createMockFetch, sseStream } from "./test/fixtures.ts";
import {
  BASE,
  chatChunks,
  client,
  createMockCreateFetch,
  mintedSessionId,
} from "./test/generation-fixtures.ts";

describe("client.chat requests", () => {
  it("create: posts the message body to /v1/agents/:agentId/sessions (no id/mode)", async () => {
    const { fetch, calls } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "msg_user_1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef/sessions`);
    expect(calls[0].init?.method).toBe("POST");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toMatchObject({
      message: {
        id: "msg_user_1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(body.id).toBeUndefined();
    expect(body.mode).toBeUndefined();
  });

  it("create: result.sessionId resolves to the minted id from the Location header", async () => {
    const { fetch } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    const result = await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(await result.sessionId).toBe(mintedSessionId);
  });

  it("create: sends the configured Agent Version Pin", async () => {
    const { fetch, calls } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
      version: 7,
    });

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.version).toBe(7);
  });

  it("resume: posts to /v1/agents/:agentId/sessions/:sessionId with the message body", async () => {
    const { fetch, calls } = createMockFetch({ stream: sseStream(chatChunks) });
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      message: {
        id: "msg_user_1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef`
    );
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toMatchObject({
      message: {
        id: "msg_user_1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(body.id).toBeUndefined();
    expect(body.mode).toBeUndefined();
  });

  it("resume: result.sessionId resolves to the passed sessionId", async () => {
    const { fetch } = createMockFetch({ stream: sseStream(chatChunks) });
    const c = client(fetch);
    const result = await c.chat({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(await result.sessionId).toBe("ss_0123456789abcdef");
  });

  it("prompt-invocation sends promptId + variables (no message)", async () => {
    const { fetch, calls } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
      variables: { name: "world" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.promptId).toBe("prompt_0123456789abcdef");
    expect(body.variables).toEqual({ name: "world" });
    expect(body.message).toBeUndefined();
  });

  it("prompt-invocation sends promptId without variables when omitted", async () => {
    const { fetch, calls } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.promptId).toBe("prompt_0123456789abcdef");
    expect(body.variables).toBeUndefined();
  });

  it("sends trigger and messageId when provided (resume route)", async () => {
    const { fetch, calls } = createMockFetch({ stream: sseStream(chatChunks) });
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
      trigger: "regenerate-message",
      messageId: "msg_42",
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.trigger).toBe("regenerate-message");
    expect(body.messageId).toBe("msg_42");
  });

  it("sends userId and metadata attribution when provided", async () => {
    const { fetch, calls } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
      userId: "user-1",
      metadata: { team: "growth" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-1");
    expect(body.metadata).toEqual({ team: "growth" });
  });

  it("forwards the abort signal", async () => {
    const { fetch, calls } = createMockCreateFetch(sseStream(chatChunks));
    const c = client(fetch);
    const controller = new AbortController();
    await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
      signal: controller.signal,
    });
    expect(calls[0].init?.signal).toBe(controller.signal);
    controller.abort();
    expect(calls[0].init?.signal?.aborted).toBe(true);
  });
});
