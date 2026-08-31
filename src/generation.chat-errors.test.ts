import { describe, expect, it, vi } from "vitest";
import { BlazingAgentsError } from "./errors.ts";
import { createMockFetch, errorEnvelope, sseStream } from "./test/fixtures.ts";
import {
  chatChunks,
  client,
  createLocation,
  createMockCreateFetch,
} from "./test/generation-fixtures.ts";

describe("client.chat failures", () => {
  it("relays malformed SSE without inspecting it", async () => {
    const encoder = new TextEncoder();
    const body = "data: {not-json}\n\ndata: [DONE]\n\n";
    const raw = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });
    const { fetch } = createMockFetch({
      headers: {
        location: createLocation,
        "x-request-id": "request-chat-malformed",
      },
      status: 201,
      stream: raw,
    });
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    await expect(result.toResponse().text()).resolves.toBe(body);
  });

  it("errors the relay with stream_error when transport fails", async () => {
    const raw = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("socket closed"));
      },
    });
    const { fetch } = createMockFetch({
      headers: {
        location: createLocation,
        "x-request-id": "request-chat-relay-transport",
      },
      status: 201,
      stream: raw,
    });
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    await expect(result.toResponse().text()).rejects.toMatchObject({
      code: "stream_error",
      message: "socket closed",
      requestId: "request-chat-relay-transport",
    });
  });

  it("uses a safe stream_error message for a non-Error relay failure", async () => {
    const raw = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error("socket closed");
      },
    });
    const { fetch } = createMockFetch({
      headers: {
        location: createLocation,
        "x-request-id": "request-chat-non-error",
      },
      status: 201,
      stream: raw,
    });
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    await expect(result.toResponse().text()).rejects.toMatchObject({
      code: "stream_error",
      message: "The chat response stream failed.",
      requestId: "request-chat-non-error",
    });
  });

  it("relay mode passes the error chunk through untouched", async () => {
    const { fetch } = createMockCreateFetch(
      sseStream([
        { type: "start", messageId: "msg_1" },
        { type: "error", errorText: "boom" },
      ])
    );
    const c = client(fetch);
    const result = await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    const relayed = await result.toResponse().text();
    expect(relayed).toContain('"type":"error"');
    expect(relayed).toContain("boom");
  });

  it("pre-stream 404 throws BlazingAgentsError before any stream is built", async () => {
    const { fetch } = createMockFetch({
      status: 404,
      text: errorEnvelope("not_found", "Agent not found"),
    });
    const c = client(fetch);
    await expect(
      c.chat({
        agentId: "ag_0123456789abcdef",
        message: {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
        },
      })
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("network_error when fetch throws", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("connection refused")));
    const c = client(fetch);
    const error = (await c
      .chat({
        agentId: "ag_0123456789abcdef",
        message: {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
        },
      })
      .catch((e) => e)) as BlazingAgentsError;
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error.code).toBe("network_error");
  });

  it("reports a null response body as stream_error through the relay", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 201,
          headers: {
            "content-type": "text/event-stream",
            location: createLocation,
            "x-request-id": "request-chat-null-relay",
          },
        })
    );
    const c = client(fetch);
    const result = await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    await expect(result.toResponse().text()).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-chat-null-relay",
    });
  });

  it("cancels the selected relay without reading it", async () => {
    const raw = new ReadableStream<Uint8Array>();
    const { fetch } = createMockCreateFetch(raw);
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    await expect(
      result.toResponse().body?.cancel("terminal closed")
    ).resolves.toBeUndefined();
  });

  it("normalizes relay stream cancellation failures", async () => {
    const raw = new ReadableStream<Uint8Array>({
      cancel() {
        throw new Error("cancel failed");
      },
    });
    const { fetch } = createMockFetch({
      headers: {
        location: createLocation,
        "x-request-id": "request-chat-cancel",
      },
      status: 201,
      stream: raw,
    });
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    await expect(result.toResponse().body?.cancel()).rejects.toMatchObject({
      code: "stream_error",
      message: "cancel failed",
      requestId: "request-chat-cancel",
    });
  });

  it("create without a Location header rejects result.sessionId with stream_error", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(sseStream(chatChunks), {
          status: 201,
          headers: {
            "content-type": "text/event-stream",
            "x-request-id": "request-missing-location",
          },
        })
    );
    const c = client(fetch);
    const result = await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    const error = (await result.sessionId.catch(
      (e) => e
    )) as BlazingAgentsError;
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error.code).toBe("stream_error");
    expect(error.requestId).toBe("request-missing-location");
    expect(error.message).toBe(
      "The server did not return a session id (no Location header)."
    );
  });

  it("create with a malformed Location id rejects result.sessionId with stream_error", async () => {
    /**
     * The Location header's trailing segment is not a valid `ss_` id —
     * `sessionIdSchema` rejects it so the bad value does not flow into a
     * resume call as an untyped string.
     */
    const fetch = vi.fn(
      async () =>
        new Response(sseStream(chatChunks), {
          status: 201,
          headers: {
            "content-type": "text/event-stream",
            location:
              "/v1/agents/ag_0123456789abcdef/sessions/not-a-session-id",
            "x-request-id": "request-malformed-location",
          },
        })
    );
    const c = client(fetch);
    const result = await c.chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    const error = (await result.sessionId.catch(
      (e) => e
    )) as BlazingAgentsError;
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error.code).toBe("stream_error");
    expect(error.requestId).toBe("request-malformed-location");
    expect(error.message).toBe(
      "The server returned a malformed session Location header."
    );
  });
});
