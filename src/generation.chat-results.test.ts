import { describe, expect, it } from "vitest";
import { createMockFetch, sseStream } from "./test/fixtures.ts";
import {
  chatChunks,
  client,
  createLocation,
  createMockCreateFetch,
  mintedSessionId,
} from "./test/generation-fixtures.ts";

describe("client.chat result", () => {
  it("exposes the session id and untouched SSE relay", async () => {
    const { fetch } = createMockFetch({
      headers: {
        "content-encoding": "gzip",
        "content-length": "999",
        location: createLocation,
        "x-request-id": "request-chat-1",
      },
      status: 201,
      stream: sseStream(chatChunks),
    });
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    expect(Object.keys(result).sort()).toEqual([
      "requestId",
      "sessionId",
      "toResponse",
    ]);
    expect(result.requestId).toBe("request-chat-1");

    const response = result.toResponse();
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(createLocation);
    expect(response.headers.get("x-request-id")).toBe("request-chat-1");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("connection")).toBe("keep-alive");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const text = await response.text();
    expect(text).toContain("data: ");
    expect(text).toContain("[DONE]");
  });

  it("keeps the Session id independently awaitable after selecting the response", async () => {
    const { fetch } = createMockCreateFetch(sseStream(chatChunks));
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    const response = result.toResponse();
    await expect(result.sessionId).resolves.toBe(mintedSessionId);

    await expect(response.text()).resolves.toContain('"type":"finish"');
  });

  it("rejects a second response claim with stream_error", async () => {
    const { fetch } = createMockCreateFetch(sseStream(chatChunks));
    const result = await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });

    result.toResponse();

    expect(() => result.toResponse()).toThrowError(
      expect.objectContaining({
        code: "stream_error",
        message: "The chat response body has already been claimed.",
      })
    );
  });
});
