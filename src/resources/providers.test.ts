import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { BlazingAgentsError } from "../errors.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const providerRow = {
  id: "prv_0123456789abcdef",
  name: "OpenAI",
  providerType: "openai",
  baseUrl: null,
  keyFragment: "abcd",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.providers", () => {
  it("create posts to /v1/providers", async () => {
    const { fetch, calls } = createMockFetch({ body: providerRow });
    const c = client(fetch);
    const provider = await c.providers.create({
      name: "OpenAI",
      providerType: "openai",
      baseUrl: null,
      apiKey: "sk-x",
    });
    expect(provider.id).toBe("prv_0123456789abcdef");
    expect(calls[0].url).toBe(`${BASE}/v1/providers`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      name: "OpenAI",
      providerType: "openai",
      baseUrl: null,
      apiKey: "sk-x",
    });
  });

  it("creates and parses a Vercel AI Gateway Provider", async () => {
    const gatewayRow = {
      ...providerRow,
      name: "Gateway",
      providerType: "vercel_ai_gateway",
    };
    const { fetch, calls } = createMockFetch({ body: gatewayRow });
    const provider = await client(fetch).providers.create({
      apiKey: "vck_test",
      baseUrl: null,
      name: "Gateway",
      providerType: "vercel_ai_gateway",
    });

    expect(provider.providerType).toBe("vercel_ai_gateway");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      apiKey: "vck_test",
      baseUrl: null,
      name: "Gateway",
      providerType: "vercel_ai_gateway",
    });
  });

  it("list gets /v1/providers", async () => {
    const { fetch, calls } = createMockFetch({
      body: { providers: [providerRow] },
    });
    const c = client(fetch);
    const result = await c.providers.list();
    expect(result.providers).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v1/providers`);
  });

  it("get gets /v1/providers/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: providerRow });
    const c = client(fetch);
    await c.providers.get("prv_0123456789abcdef");
    expect(calls[0].url).toBe(`${BASE}/v1/providers/prv_0123456789abcdef`);
  });

  it("rejects an invalid success response as invalid_response", async () => {
    const { fetch } = createMockFetch({
      body: { unexpected: true },
      headers: { "x-request-id": "req_invalid_provider" },
    });

    const error = await client(fetch)
      .providers.get("prv_0123456789abcdef")
      .catch((caught: unknown) => caught);

    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      code: "invalid_response",
      requestId: "req_invalid_provider",
      responseBody: '{"unexpected":true}',
      status: 200,
    });
  });

  it("listModels gets /v1/providers/:id/models", async () => {
    const { fetch, calls } = createMockFetch({
      body: { models: [{ id: "gpt-4.1" }] },
    });
    const result = await client(fetch).providers.listModels(
      "prv_0123456789abcdef"
    );
    expect(result.models).toEqual([{ id: "gpt-4.1" }]);
    expect(calls[0].url).toBe(
      `${BASE}/v1/providers/prv_0123456789abcdef/models`
    );
  });

  it("update PATCHes /v1/providers/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: providerRow });
    const c = client(fetch);
    await c.providers.update("prv_0123456789abcdef", { name: "Renamed" });
    expect(calls[0].url).toBe(`${BASE}/v1/providers/prv_0123456789abcdef`);
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      name: "Renamed",
    });
  });

  it("delete DELETEs /v1/providers/:id", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.providers.delete("prv_0123456789abcdef");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/v1/providers/prv_0123456789abcdef`);
  });

  it("delete exposes historical Version invalidation confirmation", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.providers.delete("prv_0123456789abcdef", {
      confirmVersionInvalidation: true,
    });
    expect(calls[0].url).toBe(
      `${BASE}/v1/providers/prv_0123456789abcdef?confirmVersionInvalidation=true`
    );
  });
});
