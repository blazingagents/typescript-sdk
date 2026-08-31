import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch, sseStream } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const sessionListItem = {
  agentVersion: null,
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
  it("inspects pending Tool approval state", async () => {
    const response = {
      continuation: { id: "tool-approval:ss:assistant", state: "waiting" },
      data: [
        {
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
      client(fetch).sessions.toolApprovals(
        "ag_0123456789abcdef",
        "ss_0123456789abcdef"
      )
    ).resolves.toEqual(response);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef/tool-approvals`
    );
  });

  it("submits only the approval decision and optional reason", async () => {
    const response = {
      continuationId: "tool-approval:ss:assistant",
      state: "queued",
    };
    const { fetch, calls } = createMockFetch({ body: response, status: 202 });
    const abort = new AbortController();

    await expect(
      client(fetch).sessions.decideToolApproval(
        "ag_0123456789abcdef",
        "ss_0123456789abcdef",
        "approval-1",
        { approved: false, reason: "Keep it" },
        { signal: abort.signal }
      )
    ).resolves.toEqual(response);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ approved: false, reason: "Keep it" })
    );
    expect(calls[0].init?.signal).toBe(abort.signal);
  });

  it("submits approval decisions without an AbortSignal", async () => {
    const { fetch, calls } = createMockFetch({
      body: {
        continuationId: "tool-approval:ss:assistant",
        state: "waiting",
      },
      status: 202,
    });

    await client(fetch).sessions.decideToolApproval(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      "approval-1",
      { approved: true }
    );

    expect(calls[0].init?.signal).toBeUndefined();
  });

  it("rejoins a continuation through the relay terminal primitive", async () => {
    const chunks = [
      { messageId: "assistant-1", type: "start" },
      { id: "text-1", type: "text-start" },
      { delta: "Done", id: "text-1", type: "text-delta" },
      { id: "text-1", type: "text-end" },
      { finishReason: "stop", type: "finish" },
    ];
    const { fetch, calls } = createMockFetch({
      headers: { "x-request-id": "request-continuation-1" },
      stream: sseStream(chunks),
    });
    const abort = new AbortController();

    const result = await client(fetch).sessions.joinToolApprovalContinuation(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      "tool-approval:ss:assistant",
      { signal: abort.signal }
    );
    await expect(result.toResponse().text()).resolves.toContain(
      '"delta":"Done"'
    );
    expect(result.requestId).toBe("request-continuation-1");
    expect(calls[0].init?.signal).toBe(abort.signal);
    expect(() => result.toResponse()).toThrowError(
      expect.objectContaining({
        code: "stream_error",
        requestId: "request-continuation-1",
      })
    );
  });

  it("rejoins a continuation without an AbortSignal", async () => {
    const { fetch, calls } = createMockFetch({ stream: sseStream([]) });

    const result = await client(fetch).sessions.joinToolApprovalContinuation(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      "tool-approval:ss:assistant"
    );
    await result.toResponse().body?.cancel();

    expect(calls[0].init?.signal).toBeUndefined();
  });

  it("preserves continuation response correlation and streaming headers", async () => {
    const location = "/v1/continuations/tool-approval:ss:assistant";
    const { fetch } = createMockFetch({
      headers: {
        location,
        "x-request-id": "request-continuation-response",
      },
      status: 202,
      stream: sseStream([]),
    });

    const result = await client(fetch).sessions.joinToolApprovalContinuation(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      "tool-approval:ss:assistant"
    );
    expect(result.requestId).toBe("request-continuation-response");
    const response = result.toResponse();
    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe(location);
    expect(response.headers.get("x-request-id")).toBe(
      "request-continuation-response"
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
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
    await client(fetch).sessions.list("ag_0123456789abcdef", options);
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
    await client(fetch).sessions.messages(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      options
    );
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef/messages${suffix}`
    );
  });

  it("list gets /v1/agents/:id/sessions with cursor+limit query", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [sessionListItem], nextCursor: "next" },
    });
    const c = client(fetch);
    const page = await c.sessions.list("ag_0123456789abcdef", {
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
    const page = await c.sessions.list("ag_0123456789abcdef");
    expect(page.nextCursor).toBeNull();
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
    const page = await c.sessions.messages(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      { after: "tail", limit: 10 }
    );
    expect(page.data).toHaveLength(1);
    expect(page.latestCursor).toBe("tail");
    expect(calls[0].url).toContain("after=tail");
    expect(calls[0].url).toContain("limit=10");
  });

  it("delete DELETEs /v1/agents/:id/sessions/:sid", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.sessions.delete("ag_0123456789abcdef", "ss_0123456789abcdef", true);
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef?deleteArtifacts=true`
    );
  });

  it("rejects malformed success payloads", async () => {
    const { fetch } = createMockFetch({ body: { data: "wrong" } });
    await expect(
      client(fetch).sessions.list("ag_0123456789abcdef")
    ).rejects.toBeDefined();
  });
});
