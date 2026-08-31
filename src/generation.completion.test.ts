import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "./client.ts";
import { createMockFetch, textStream } from "./test/fixtures.ts";

const BASE = "http://localhost:8787";

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.completion", () => {
  it("posts text output to the unified generation endpoint", async () => {
    const { fetch, calls } = createMockFetch({ stream: textStream(["Hello"]) });
    const c = client(fetch);
    await c.completion({ agentId: "ag_0123456789abcdef", prompt: "hi" });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/generation`
    );
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ prompt: "hi", output: { type: "text" } });
    expect(calls[0].init?.method).toBe("POST");
  });

  it("sends the optional Version Pin unchanged", async () => {
    const { fetch, calls } = createMockFetch({ stream: textStream(["Hello"]) });
    const sdk = client(fetch);
    await sdk.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      version: 7,
    });

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.version).toBe(7);
  });

  it("textStream yields text deltas", async () => {
    const { fetch } = createMockFetch({
      stream: textStream(["Hello ", "world"]),
    });
    const c = client(fetch);
    const result = await c.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
    }
    expect(text).toBe("Hello world");
  });

  it("await result.text resolves to the full text", async () => {
    const { fetch } = createMockFetch({
      stream: textStream(["Hello ", "world"]),
    });
    const c = client(fetch);
    const result = await c.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    expect(await result.text).toBe("Hello world");
  });

  it("toResponse() relays the text body", async () => {
    const { fetch } = createMockFetch({ stream: textStream(["Hello"]) });
    const c = client(fetch);
    const result = await c.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    const response = result.toResponse();
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("Hello");
  });

  it("exposes request correlation and preserves response metadata", async () => {
    const { fetch } = createMockFetch({
      headers: {
        "content-encoding": "gzip",
        "content-length": "999",
        location: "/v1/generations/gen_1",
        "x-request-id": "request-completion-1",
      },
      status: 202,
      stream: textStream(["Hello"]),
    });
    const result = await client(fetch).completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });

    expect(result.requestId).toBe("request-completion-1");
    const response = result.toResponse();
    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe("/v1/generations/gen_1");
    expect(response.headers.get("x-request-id")).toBe("request-completion-1");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("Hello");
  });

  it("reports a repeated response-body claim as stream_error", async () => {
    const { fetch } = createMockFetch({
      headers: { "x-request-id": "request-completion-claimed" },
      stream: textStream(["Hello"]),
    });
    const result = await client(fetch).completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });

    result.toResponse();
    expect(() => result.toResponse()).toThrowError(
      expect.objectContaining({
        code: "stream_error",
        requestId: "request-completion-claimed",
      })
    );
  });

  it("prompt-invocation sends promptId + variables", async () => {
    const { fetch, calls } = createMockFetch({ stream: textStream(["ok"]) });
    const c = client(fetch);
    await c.completion({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
      variables: { x: "y" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({
      promptId: "prompt_0123456789abcdef",
      variables: { x: "y" },
      output: { type: "text" },
    });
  });

  it("sends userId and metadata attribution when provided", async () => {
    const { fetch, calls } = createMockFetch({ stream: textStream(["ok"]) });
    const c = client(fetch);
    await c.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      userId: "user-1",
      metadata: { team: "growth" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-1");
    expect(body.metadata).toEqual({ team: "growth" });
  });

  it("prompt-invocation sends promptId without variables when omitted", async () => {
    const { fetch, calls } = createMockFetch({ stream: textStream(["ok"]) });
    const c = client(fetch);
    await c.completion({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({
      promptId: "prompt_0123456789abcdef",
      output: { type: "text" },
    });
    expect(body.variables).toBeUndefined();
  });

  it("forwards the abort signal", async () => {
    const { fetch, calls } = createMockFetch({ stream: textStream(["ok"]) });
    const c = client(fetch);
    const controller = new AbortController();
    await c.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      signal: controller.signal,
    });
    expect(calls[0].init?.signal).toBe(controller.signal);
  });

  it("reports a null response body as stream_error on every result branch", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "text/plain",
            "x-request-id": "request-completion-null",
          },
        })
    );
    const c = client(fetch);
    const result = await c.completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    const consumeTextStream = async () => {
      for await (const _delta of result.textStream) {
        // Drain through the public stream seam.
      }
    };
    const expected = {
      code: "stream_error",
      requestId: "request-completion-null",
    };
    await expect(consumeTextStream()).rejects.toMatchObject(expected);
    await expect(result.text).rejects.toMatchObject(expected);
    await expect(result.toResponse().text()).rejects.toMatchObject(expected);
  });

  it("does not trigger an unhandled rejection when the stream errors and .text is never awaited", async () => {
    /**
     * A stream that errors mid-flight. The caller only consumes
     * `textStream` (which throws) and never awaits `.text` — the
     * textPromise must have a no-op catch handler attached so it does
     * not surface as an unhandled rejection.
     */
    const erroringStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("stream broke"));
      },
    });
    const { fetch } = createMockFetch({ stream: erroringStream });
    const c = client(fetch);

    const rejections: unknown[] = [];
    const handler = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", handler);
    try {
      const result = await c.completion({
        agentId: "ag_0123456789abcdef",
        prompt: "hi",
      });
      // Drain the textStream so the stream error is observed.
      await expect(
        (async () => {
          for await (const _delta of result.textStream) {
            // consume
          }
        })()
      ).rejects.toThrow("stream broke");
      // Give the unhandled-rejection microtask queue a chance to flush.
      await new Promise((resolve) => setImmediate(resolve));
      expect(rejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", handler);
    }
  });
});
