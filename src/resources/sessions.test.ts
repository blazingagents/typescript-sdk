import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { agentConfigFixture } from "../contracts/test/fixtures/tasks.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const sessionListItem = {
  id: "ss_0123456789abcdef",
  messageCount: 2,
  lastMessagePreview: "hi",
  userId: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const sessionMessage = {
  id: "msg_1",
  role: "user",
  parts: [{ type: "text", text: "hi" }],
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.sessions", () => {
  it("gets a Session with its saved Agent config", async () => {
    const response = { ...sessionListItem, agentConfig: agentConfigFixture };
    const { fetch, calls } = createMockFetch({ body: response });

    await expect(
      client(fetch).sessions.get({
        agentId: "ag_0123456789abcdef",
        sessionId: "ss_0123456789abcdef",
      })
    ).resolves.toEqual(response);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef`
    );
  });
  it("inspects pending Tool approval state", async () => {
    const response = {
      continuation: { id: "tool-approval:ss:assistant", state: "waiting" },
      data: [
        {
          tool: {
            type: "mcp",
            connectionId: "mcp_0123456789abcdef",
            name: "send_mail",
          },
          assistantMessageId: "assistant-1",
          createdAt: "2026-09-12T00:00:00Z",
          decidedAt: null,
          approvalId: "approval-1",
          decision: "pending",
          input: { action: "deleteById", agentId: "ag_target" },
          reason: null,
          toolCallId: "call-1",
          toolName: "agents",
        },
      ],
    };
    const { fetch, calls } = createMockFetch({ body: response });

    await expect(
      client(fetch).sessions.toolApprovals({
        agentId: "ag_0123456789abcdef",
        sessionId: "ss_0123456789abcdef",
      })
    ).resolves.toEqual(response);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef/tool-approvals`
    );
  });

  it.each([
    [{}, ""],
    [{ cursor: "next page" }, "?cursor=next+page"],
    [{ limit: 50 }, "?limit=50"],
    [{ userId: "" }, "?userId="],
    [{ userId: "end/user" }, "?userId=end%2Fuser"],
    [
      { cursor: "next", limit: 50, userId: "end-user" },
      "?cursor=next&limit=50&userId=end-user",
    ],
  ])("serializes list options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).sessions.list({
      agentId: "ag_0123456789abcdef",
      ...options,
    });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions${suffix}`
    );
  });

  it.each([
    [{}, ""],
    [{ after: "tail value" }, "?after=tail+value"],
    [{ cursor: "next page" }, "?cursor=next+page"],
    [{ limit: 10 }, "?limit=10"],
    [
      { after: "tail", cursor: "next", limit: 10 },
      "?cursor=next&after=tail&limit=10",
    ],
  ])("serializes message options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null, latestCursor: null },
    });
    await client(fetch).sessions.messages({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      ...options,
    });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef/messages${suffix}`
    );
  });

  it("list gets /v1/agents/:id/sessions with cursor+limit query", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [sessionListItem], nextCursor: "next" },
    });
    const c = client(fetch);
    const page = await c.sessions.list({
      agentId: "ag_0123456789abcdef",
      cursor: "abc",
      limit: 50,
    });
    expect(page.data).toHaveLength(1);
    expect(page.nextCursor).toBe("next");
    expect(calls[0].url).toContain("cursor=abc");
    expect(calls[0].url).toContain("limit=50");
  });

  it("list passes nextCursor: null through verbatim", async () => {
    const { fetch } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    const c = client(fetch);
    const page = await c.sessions.list({ agentId: "ag_0123456789abcdef" });
    expect(page.nextCursor).toBeNull();
  });

  it.each([
    [undefined, ""],
    [{}, ""],
    [{ cursor: "next page" }, "?cursor=next+page"],
    [{ limit: 20 }, "?limit=20"],
    [{ byAgent: false }, "?byAgent=false"],
    [{ byAgent: true }, "?byAgent=true"],
    [{ userId: "" }, "?userId="],
    [
      { byAgent: true, cursor: "next", limit: 20, userId: "end-user" },
      "?cursor=next&limit=20&userId=end-user&byAgent=true",
    ],
  ])("listLatest serializes options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).sessions.listLatest(options);
    expect(calls[0].url).toBe(`${BASE}/v1/sessions/latest${suffix}`);
  });

  it("listLatest returns latest Sessions with their agentId", async () => {
    const item = {
      ...sessionListItem,
      agentId: "ag_0123456789abcdef",
      model: "test-model",
      thinkingLevel: "high",
      status: "disabled",
    };
    const { fetch, calls } = createMockFetch({
      body: { data: [item], nextCursor: "next" },
    });
    const abort = new AbortController();
    const page = await client(fetch).sessions.listLatest({
      abortSignal: abort.signal,
    });
    expect(page).toEqual({ data: [item], nextCursor: "next" });
    expect(calls[0].init?.signal).toBe(abort.signal);
  });

  it("listLatest rejects items without an agentId", async () => {
    const { fetch } = createMockFetch({
      body: { data: [sessionListItem], nextCursor: null },
    });
    await expect(client(fetch).sessions.listLatest()).rejects.toBeDefined();
  });

  it("messages gets /v1/agents/:id/sessions/:sid/messages", async () => {
    const { fetch, calls } = createMockFetch({
      body: {
        data: [sessionMessage],
        nextCursor: null,
        latestCursor: "tail",
      },
    });
    const c = client(fetch);
    const page = await c.sessions.messages({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      after: "tail",
      limit: 10,
    });
    expect(page.data).toHaveLength(1);
    expect(page.latestCursor).toBe("tail");
    expect(calls[0].url).toContain("after=tail");
    expect(calls[0].url).toContain("limit=10");
  });

  it("delete DELETEs /v1/agents/:id/sessions/:sid", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.sessions.delete({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      deleteArtifacts: true,
    });
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef?deleteArtifacts=true`
    );
  });

  it("rejects malformed success payloads", async () => {
    const { fetch } = createMockFetch({ body: { data: "wrong" } });
    await expect(
      client(fetch).sessions.list({ agentId: "ag_0123456789abcdef" })
    ).rejects.toBeDefined();
  });
});
