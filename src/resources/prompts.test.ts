import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const promptRow = {
  id: "prompt_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  agentId: null,
  name: "Greeting",
  template: "Hello {{name}}",
  variables: ["name"],
  userId: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.prompts", () => {
  it("create posts to /v1/prompts", async () => {
    const { fetch, calls } = createMockFetch({ body: promptRow });
    const c = client(fetch);
    const prompt = await c.prompts.create({
      name: "Greeting",
      template: "Hello {{name}}",
    });
    expect(prompt.id).toBe("prompt_0123456789abcdef");
    expect(prompt.variables).toEqual(["name"]);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/prompts`);
  });

  it("create threads end-user attribution (userId + metadata) into the body", async () => {
    const { fetch, calls } = createMockFetch({
      body: { ...promptRow, userId: "user-42", metadata: { tier: "pro" } },
    });
    const c = client(fetch);
    const prompt = await c.prompts.create({
      name: "Greeting",
      template: "Hello {{name}}",
      userId: "user-42",
      metadata: { tier: "pro" },
    });
    expect(prompt.userId).toBe("user-42");
    expect(prompt.metadata).toEqual({ tier: "pro" });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-42");
    expect(body.metadata).toEqual({ tier: "pro" });
  });

  it("list gets /v1/prompts", async () => {
    const { fetch } = createMockFetch({ body: { prompts: [promptRow] } });
    const c = client(fetch);
    const result = await c.prompts.list();
    expect(result.prompts).toHaveLength(1);
  });

  it.each([
    [undefined, `${BASE}/v1/prompts`],
    ["", `${BASE}/v1/prompts?userId=`],
    ["end user/1", `${BASE}/v1/prompts?userId=end+user%2F1`],
  ])("serializes list attribution %#", async (userId, expectedUrl) => {
    const { fetch, calls } = createMockFetch({ body: { prompts: [] } });
    await client(fetch).prompts.list({ userId });
    expect(calls[0].url).toBe(expectedUrl);
  });

  it("creates and lists prompts by Agent and End-user", async () => {
    const agentId = "ag_0123456789abcdef";
    const created = createMockFetch({ body: { ...promptRow, agentId } });
    const prompt = await client(created.fetch).prompts.create({
      name: "Linked",
      template: "Hello",
      agentId,
    });
    expect(prompt.agentId).toBe(agentId);
    expect(JSON.parse(created.calls[0].init?.body as string).agentId).toBe(
      agentId
    );
    const listed = createMockFetch({
      body: { prompts: [{ ...promptRow, agentId }] },
    });
    expect(
      (await client(listed.fetch).prompts.list({ agentId, userId: "user-42" }))
        .prompts[0].agentId
    ).toBe(agentId);
    const url = new URL(listed.calls[0].url);
    expect(url.searchParams.get("agentId")).toBe(agentId);
    expect(url.searchParams.get("userId")).toBe("user-42");
    const updated = createMockFetch({ body: { ...promptRow, agentId: null } });
    expect(
      (
        await client(updated.fetch).prompts.update({
          promptId: promptRow.id,
          agentId: null,
        })
      ).agentId
    ).toBeNull();
    expect(JSON.parse(updated.calls[0].init?.body as string)).toEqual({
      agentId: null,
    });
  });

  it("get gets /v1/prompts/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: promptRow });
    const c = client(fetch);
    await c.prompts.get({ promptId: "prompt_0123456789abcdef" });
    expect(calls[0].url).toBe(`${BASE}/v1/prompts/prompt_0123456789abcdef`);
  });

  it("update PATCHes /v1/prompts/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: promptRow });
    const c = client(fetch);
    await c.prompts.update({
      promptId: "prompt_0123456789abcdef",
      name: "Renamed",
    });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/v1/prompts/prompt_0123456789abcdef`);
  });

  it("delete DELETEs /v1/prompts/:id", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.prompts.delete({ promptId: "prompt_0123456789abcdef" });
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/v1/prompts/prompt_0123456789abcdef`);
  });

  it("rejects malformed success payloads", async () => {
    const { fetch } = createMockFetch({ body: { prompts: [{ id: 1 }] } });
    await expect(client(fetch).prompts.list()).rejects.toBeDefined();
  });
});
