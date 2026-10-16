import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockFetch, sseStream } from "./test/fixtures.ts";
import {
  chatChunks,
  client,
  createLocation,
  createMockCreateFetch,
  mintedSessionId,
} from "./test/generation-fixtures.ts";

const turnId = "turn_0123456789abcdef";
const agentId = "ag_0123456789abcdef";
const message: UIMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", text: "hi" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("client.chat result", () => {
  it("exposes the session id and untouched SSE relay", async () => {
    const { fetch } = createMockFetch({
      headers: {
        "content-encoding": "gzip",
        "content-length": "999",
        location: createLocation,
        "x-ba-turn-id": turnId,
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
      "toStream",
      "turnId",
    ]);
    expect(result.requestId).toBe("request-chat-1");
    await expect(result.turnId).resolves.toBe(turnId);

    const response = result.toResponse();
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(createLocation);
    expect(response.headers.get("x-request-id")).toBe("request-chat-1");
    expect(response.headers.get("x-ba-turn-id")).toBe(turnId);
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

  it.each([
    ["toResponse", "toResponse"],
    ["toStream", "toStream"],
    ["toStream", "toResponse"],
    ["toResponse", "toStream"],
  ] as const)(
    "rejects a second claim after %s with %s as stream_error",
    async (first, second) => {
      const { fetch } = createMockFetch({
        headers: { location: createLocation, "x-request-id": "stream-test" },
        status: 201,
        stream: sseStream(chatChunks),
      });
      const result = await client(fetch).chat({ agentId, message });

      result[first]();

      expect(() => result[second]()).toThrowError(
        expect.objectContaining({
          code: "stream_error",
          message:
            "[stream_error] The chat response body has already been claimed.",
          requestId: "stream-test",
        })
      );
    }
  );

  it("relays untouched bytes without calling the global Response constructor", async () => {
    const bytes = new TextEncoder().encode("data: [DONE]\n\n");
    const { fetch } = createMockFetch({
      headers: { location: createLocation, "x-request-id": "stream-test" },
      status: 201,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    const result = await client(fetch).chat({ agentId, message });
    const responseConstructor = vi.fn(() => {
      throw new Error("Response does not support streaming bodies");
    });
    vi.stubGlobal("Response", responseConstructor);

    const reader = result.toStream().getReader();

    await expect(reader.read()).resolves.toEqual({ done: false, value: bytes });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(responseConstructor).not.toHaveBeenCalled();
  });

  it("preserves normalized read failures and request identity on the byte stream", async () => {
    const { fetch } = createMockFetch({
      headers: { location: createLocation, "x-request-id": "stream-test" },
      status: 201,
      stream: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("socket closed"));
        },
      }),
    });
    const result = await client(fetch).chat({ agentId, message });

    await expect(result.toStream().getReader().read()).rejects.toMatchObject({
      code: "stream_error",
      message: "[stream_error] socket closed",
      requestId: "stream-test",
    });
  });

  it("forwards byte-stream cancellation to the original body", async () => {
    const cancel = vi.fn();
    const { fetch } = createMockFetch({
      headers: { location: createLocation },
      status: 201,
      stream: new ReadableStream<Uint8Array>({ cancel }),
    });
    const result = await client(fetch).chat({ agentId, message });

    await result.toStream().cancel("screen closed");

    expect(cancel).toHaveBeenCalledWith("screen closed");
  });

  it.each([
    ["missing", undefined],
    ["malformed", "turn_short"],
  ])(
    "rejects turnId with stream_error when the header is %s",
    async (_case, header) => {
      const { fetch } = createMockFetch({
        headers: {
          location: createLocation,
          ...(header === undefined ? {} : { "x-ba-turn-id": header }),
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

      await expect(result.turnId).rejects.toMatchObject({
        code: "stream_error",
      });
      await expect(result.sessionId).resolves.toBe(mintedSessionId);
      await expect(result.toResponse().text()).resolves.toContain("[DONE]");
    }
  );
});
