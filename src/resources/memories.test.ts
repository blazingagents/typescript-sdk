import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const agentId = "ag_0123456789abcdef";
const memoryId = "mem_0123456789abcdef";
const memoryRow = {
  id: memoryId,
  tenantId: "ten_0123456789abcdef",
  agentId,
  userId: "",
  text: "Prefers dark mode",
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  lastAccessedAt: "2026-07-18T00:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.memories", () => {
  it("lists memories with the browse/query options and parses the page", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [memoryRow], nextCursor: "next" },
    });
    const result = await client(fetch).memories.list(agentId, {
      cursor: "next page",
      limit: 25,
      search: "dark mode",
      userId: "",
    });

    expect(result).toEqual({ data: [memoryRow], nextCursor: "next" });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/memories?userId=&search=dark+mode&cursor=next+page&limit=25`
    );
  });

  it("lists in browse mode without query parameters", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });

    await client(fetch).memories.list(agentId);

    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/memories`);
  });

  it("create posts to /v1/agents/:agentId/memories", async () => {
    const { fetch, calls } = createMockFetch({ body: { memory: memoryRow } });
    const c = client(fetch);
    const result = await c.memories.create(agentId, {
      text: "Prefers dark mode",
    });
    expect(result.memory.id).toBe(memoryId);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/memories`);
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ text: "Prefers dark mode" });
  });

  it("create threads the userId partition into the body", async () => {
    const { fetch, calls } = createMockFetch({
      body: { memory: { ...memoryRow, userId: "user-42" } },
    });
    const c = client(fetch);
    const result = await c.memories.create(agentId, {
      text: "Prefers dark mode",
      userId: "user-42",
    });
    expect(result.memory.userId).toBe("user-42");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-42");
  });

  it("get gets /v1/agents/:agentId/memories/:memoryId", async () => {
    const { fetch, calls } = createMockFetch({ body: { memory: memoryRow } });
    const c = client(fetch);
    const result = await c.memories.get(agentId, memoryId);
    expect(result.memory.text).toBe("Prefers dark mode");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/memories/${memoryId}`
    );
  });

  it("update PATCHes /v1/agents/:agentId/memories/:memoryId with { text }", async () => {
    const { fetch, calls } = createMockFetch({ body: { memory: memoryRow } });
    const c = client(fetch);
    await c.memories.update(agentId, memoryId, { text: "Prefers dark mode" });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/memories/${memoryId}`
    );
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ text: "Prefers dark mode" });
  });

  it("delete DELETEs /v1/agents/:agentId/memories/:memoryId", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.memories.delete(agentId, memoryId);
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/memories/${memoryId}`
    );
  });

  it("rejects malformed success payloads", async () => {
    const { fetch } = createMockFetch({ body: { memory: { id: 1 } } });
    await expect(
      client(fetch).memories.get(agentId, memoryId)
    ).rejects.toBeDefined();
  });

  it("rejects malformed list payloads", async () => {
    const { fetch } = createMockFetch({ body: { data: "wrong" } });
    await expect(client(fetch).memories.list(agentId)).rejects.toBeDefined();
  });
});
