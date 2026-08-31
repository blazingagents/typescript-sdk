import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "./client.ts";
import { BlazingAgentsError } from "./errors.ts";
import { createMockFetch, textStream } from "./test/fixtures.ts";

const BASE = "http://localhost:8787";

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.object", () => {
  it("posts structured output to the unified generation endpoint", async () => {
    const { fetch, calls } = createMockFetch({
      stream: textStream([JSON.stringify({ name: "Alice" })]),
    });
    const sdk = client(fetch);
    await sdk.object({
      agentId: "ag_0123456789abcdef",
      prompt: "invent a person",
      schema: { type: "object", properties: { name: { type: "string" } } },
    });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/generation`
    );
    const body = JSON.parse(calls[0].init?.body as string);
    expect(calls[0].init?.method).toBe("POST");
    expect(body.prompt).toBe("invent a person");
    expect(body.output).toEqual({
      type: "object",
      schema: {
        type: "object",
        properties: { name: { type: "string" } },
      },
    });
  });

  it("sends the optional Version Pin unchanged", async () => {
    const { fetch, calls } = createMockFetch({
      stream: textStream([JSON.stringify({ name: "Alice" })]),
    });
    const sdk = client(fetch);
    await sdk.object({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
      schema: { type: "object" },
      version: 9,
    });

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.version).toBe(9);
  });

  it("partialObjectStream yields cumulative partial JSON", async () => {
    const { fetch } = createMockFetch({
      stream: textStream(['{"name":"Al', 'ice"}']),
    });
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "invent a person",
      schema: { type: "object" },
    });
    const partials: unknown[] = [];
    for await (const partial of result.partialObjectStream) {
      partials.push(partial);
    }
    expect(partials).toEqual([{ name: "Al" }, { name: "Alice" }]);
  });

  it("await result.object resolves to the final parsed object", async () => {
    const { fetch } = createMockFetch({
      stream: textStream([JSON.stringify({ name: "Alice", age: 30 })]),
    });
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "invent a person",
      schema: { type: "object" },
    });
    expect(await result.object).toEqual({ name: "Alice", age: 30 });
  });

  it("toResponse() relays the text body", async () => {
    const { fetch } = createMockFetch({
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });
    const response = result.toResponse();
    expect(await response.text()).toBe(JSON.stringify({ ok: true }));
  });

  it("exposes request correlation and preserves response metadata", async () => {
    const { fetch } = createMockFetch({
      headers: {
        "content-encoding": "gzip",
        "content-length": "999",
        location: "/v1/generations/gen_1",
        "x-request-id": "request-object-1",
      },
      status: 202,
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const result = await client(fetch).object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });

    expect(result.requestId).toBe("request-object-1");
    const response = result.toResponse();
    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe("/v1/generations/gen_1");
    expect(response.headers.get("x-request-id")).toBe("request-object-1");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe(JSON.stringify({ ok: true }));
  });

  it("reports a repeated response-body claim as stream_error", async () => {
    const { fetch } = createMockFetch({
      headers: { "x-request-id": "request-object-claimed" },
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const result = await client(fetch).object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });

    result.toResponse();
    expect(() => result.toResponse()).toThrowError(
      expect.objectContaining({
        code: "stream_error",
        requestId: "request-object-claimed",
      })
    );
  });

  it("prompt-invocation sends promptId + variables + schema", async () => {
    const { fetch, calls } = createMockFetch({
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const c = client(fetch);
    await c.object({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
      variables: { x: "y" },
      schema: { type: "object" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.promptId).toBe("prompt_0123456789abcdef");
    expect(body.variables).toEqual({ x: "y" });
    expect(body.output).toEqual({ type: "object", schema: { type: "object" } });
    expect(body.prompt).toBeUndefined();
  });

  it("sends userId and metadata attribution when provided", async () => {
    const { fetch, calls } = createMockFetch({
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const c = client(fetch);
    await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      schema: { type: "object" },
      userId: "user-1",
      metadata: { team: "growth" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-1");
    expect(body.metadata).toEqual({ team: "growth" });
  });

  it("prompt-invocation sends promptId without variables when omitted", async () => {
    const { fetch, calls } = createMockFetch({
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const c = client(fetch);
    await c.object({
      agentId: "ag_0123456789abcdef",
      promptId: "prompt_0123456789abcdef",
      schema: { type: "object" },
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.promptId).toBe("prompt_0123456789abcdef");
    expect(body.variables).toBeUndefined();
  });

  it("invalid final JSON rejects await result.object with stream_error", async () => {
    const { fetch } = createMockFetch({
      headers: { "x-request-id": "request-object-invalid-final" },
      stream: textStream(["not json"]),
    });
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });
    const error = (await result.object.catch((e) => e)) as BlazingAgentsError;
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error.code).toBe("stream_error");
    expect(error.message).toBe("The agent produced invalid JSON.");
    expect(error.requestId).toBe("request-object-invalid-final");
  });

  it("partialObjectStream emits cumulative partial objects", async () => {
    const { fetch } = createMockFetch({
      stream: textStream(['{"name":', '"Al"}']),
    });
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });
    const partials: unknown[] = [];
    for await (const partial of result.partialObjectStream) {
      partials.push(partial);
    }
    expect(partials).toEqual([{}, { name: "Al" }]);
  });

  it("partialObjectStream omits text that cannot form partial JSON", async () => {
    const { fetch } = createMockFetch({
      headers: { "x-request-id": "request-object-invalid-partial" },
      stream: textStream(["not json"]),
    });
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });
    const partials: unknown[] = [];
    const consumePartialStream = async () => {
      for await (const partial of result.partialObjectStream) {
        partials.push(partial);
      }
    };
    await expect(consumePartialStream()).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-object-invalid-partial",
    });
    expect(partials).toEqual([]);
    await expect(result.object).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-object-invalid-partial",
    });
  });

  it("forwards the abort signal", async () => {
    const { fetch, calls } = createMockFetch({
      stream: textStream([JSON.stringify({ ok: true })]),
    });
    const c = client(fetch);
    const controller = new AbortController();
    await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
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
            "x-request-id": "request-object-null",
          },
        })
    );
    const c = client(fetch);
    const result = await c.object({
      agentId: "ag_0123456789abcdef",
      prompt: "x",
      schema: { type: "object" },
    });
    const consumePartialStream = async () => {
      for await (const _partial of result.partialObjectStream) {
        // Drain through the public stream seam.
      }
    };
    const expected = {
      code: "stream_error",
      requestId: "request-object-null",
    };
    await expect(consumePartialStream()).rejects.toMatchObject(expected);
    await expect(result.object).rejects.toMatchObject(expected);
    await expect(result.toResponse().text()).rejects.toMatchObject(expected);
  });
});
