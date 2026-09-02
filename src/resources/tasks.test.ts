import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const taskRow = {
  id: "tk_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  agentId: "ag_0123456789abcdef",
  agentVersion: null,
  name: "Daily",
  prompt: "Run",
  schedule: null,
  enabled: true,
  activeRunId: null,
  latestRunId: null,
  deletedAt: null,
  userId: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const taskRunRow = {
  id: "tr_0123456789abcdef",
  taskId: "tk_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  agentId: "ag_0123456789abcdef",
  agentVersion: 1,
  sessionId: "ss_0123456789abcdef",
  turnId: null,
  status: "queued",
  error: null,
  startedAt: null,
  finishedAt: null,
  cancelRequestedAt: null,
  canceledAt: null,
  userId: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const taskRunMessagesPage = {
  data: [],
  error: null,
  finishedAt: null,
  latestCursor: null,
  nextCursor: null,
  status: "running",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.tasks", () => {
  it.each([
    [{}, ""],
    [{ agentId: "ag_0123456789abcdef" }, "?agentId=ag_0123456789abcdef"],
    [{ cursor: "next page" }, "?cursor=next+page"],
    [{ limit: 25 }, "?limit=25"],
    [{ userId: "" }, "?userId="],
    [{ userId: "end/user" }, "?userId=end%2Fuser"],
    [
      {
        agentId: "ag_0123456789abcdef",
        cursor: "next",
        limit: 25,
        userId: "end-user",
      },
      "?agentId=ag_0123456789abcdef&cursor=next&limit=25&userId=end-user",
    ],
  ])("serializes list options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).tasks.list(options);
    expect(calls[0].url).toBe(`${BASE}/v1/tasks${suffix}`);
  });

  it("create posts to /v1/tasks and returns { task, runId }", async () => {
    const { fetch, calls } = createMockFetch({
      body: { task: taskRow, runId: null },
    });
    const c = client(fetch);
    const result = await c.tasks.create({
      agentId: "ag_0123456789abcdef",
      name: "Daily",
      prompt: "Run",
      schedule: null,
      enabled: true,
      submit: false,
    });
    expect(result.task.id).toBe("tk_0123456789abcdef");
    expect(result.runId).toBeNull();
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/tasks`);
  });

  it("create threads end-user attribution (userId + metadata) into the body", async () => {
    const { fetch, calls } = createMockFetch({
      body: {
        task: { ...taskRow, userId: "user-42", metadata: { tier: "pro" } },
        runId: null,
      },
    });
    const c = client(fetch);
    const result = await c.tasks.create({
      agentId: "ag_0123456789abcdef",
      name: "Daily",
      prompt: "Run",
      userId: "user-42",
      metadata: { tier: "pro" },
    });
    expect(result.task.userId).toBe("user-42");
    expect(result.task.metadata).toEqual({ tier: "pro" });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-42");
    expect(body.metadata).toEqual({ tier: "pro" });
  });

  it("create and update send Agent Version Pin changes through shared bodies", async () => {
    const createMock = createMockFetch({
      body: {
        task: { ...taskRow, agentVersion: 7 },
        runId: null,
      },
    });
    const created = await client(createMock.fetch).tasks.create({
      agentId: "ag_0123456789abcdef",
      agentVersion: 7,
      name: "Pinned",
      prompt: "Run Version 7",
    });
    expect(created.task.agentVersion).toBe(7);
    expect(JSON.parse(createMock.calls[0].init?.body as string)).toMatchObject({
      agentVersion: 7,
    });

    const updateMock = createMockFetch({ body: taskRow });
    await client(updateMock.fetch).tasks.update("tk_0123456789abcdef", {
      agentVersion: null,
    });
    expect(JSON.parse(updateMock.calls[0].init?.body as string)).toEqual({
      agentVersion: null,
    });
  });

  it("list gets /v1/tasks with agentId+cursor+limit", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [{ ...taskRow, latestRun: null }], nextCursor: null },
    });
    const c = client(fetch);
    const page = await c.tasks.list({
      agentId: "ag_0123456789abcdef",
      cursor: "abc",
      limit: 25,
    });
    expect(page.data).toHaveLength(1);
    expect(calls[0].url).toContain("agentId=ag_0123456789abcdef");
    expect(calls[0].url).toContain("cursor=abc");
    expect(calls[0].url).toContain("limit=25");
  });

  it("get gets /v1/tasks/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: taskRow });
    const c = client(fetch);
    const task = await c.tasks.get("tk_0123456789abcdef");
    expect(task.id).toBe("tk_0123456789abcdef");
    expect(calls[0].url).toBe(`${BASE}/v1/tasks/tk_0123456789abcdef`);
  });

  it("update PATCHes /v1/tasks/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: taskRow });
    const c = client(fetch);
    await c.tasks.update("tk_0123456789abcdef", { name: "Renamed" });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/v1/tasks/tk_0123456789abcdef`);
  });

  it("delete DELETEs /v1/tasks/:id", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.tasks.delete("tk_0123456789abcdef");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/v1/tasks/tk_0123456789abcdef`);
  });

  it("createRun returns the accepted run identifier without polling", async () => {
    const { fetch, calls } = createMockFetch({
      body: { runId: "tr_0123456789abcdef" },
    });
    const c = client(fetch);
    const result = await c.tasks.createRun("tk_0123456789abcdef", {
      idempotencyKey: "key1",
    });
    expect(result.runId).toBe("tr_0123456789abcdef");
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/tasks/tk_0123456789abcdef/runs`);
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      idempotencyKey: "key1",
    });
  });

  it("createRun with no body sends an empty object", async () => {
    const { fetch, calls } = createMockFetch({
      body: { runId: "tr_0123456789abcdef" },
    });
    const c = client(fetch);
    await c.tasks.createRun("tk_0123456789abcdef");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({});
  });

  it("listRuns gets /v1/tasks/:id/runs", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [taskRunRow], nextCursor: null },
    });
    const c = client(fetch);
    const page = await c.tasks.listRuns("tk_0123456789abcdef", { limit: 10 });
    expect(page.data).toHaveLength(1);
    expect(calls[0].url).toContain("limit=10");
  });

  it.each([
    [{ cursor: "next page" }, "?cursor=next+page"],
    [{ limit: 10 }, "?limit=10"],
    [{ cursor: "next", limit: 10 }, "?cursor=next&limit=10"],
  ])("serializes run list options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).tasks.listRuns("tk_0123456789abcdef", options);
    expect(calls[0].url).toBe(
      `${BASE}/v1/tasks/tk_0123456789abcdef/runs${suffix}`
    );
  });

  it("getRun retrieves durable state in a later request", async () => {
    const { fetch, calls } = createMockFetch({ body: taskRunRow });
    const c = client(fetch);
    const run = await c.tasks.getRun(
      "tk_0123456789abcdef",
      "tr_0123456789abcdef"
    );
    expect(run.id).toBe("tr_0123456789abcdef");
    expect(calls[0].url).toBe(
      `${BASE}/v1/tasks/tk_0123456789abcdef/runs/tr_0123456789abcdef`
    );
  });

  it("exposes Provider configuration failures through Task run lifecycle fields", async () => {
    const { fetch } = createMockFetch({
      body: {
        ...taskRunRow,
        error: "provider_required",
        finishedAt: "2026-01-01T00:00:01.000Z",
        sessionId: null,
        status: "failed",
      },
    });

    await expect(
      client(fetch).tasks.getRun("tk_0123456789abcdef", "tr_0123456789abcdef")
    ).resolves.toMatchObject({
      error: "provider_required",
      sessionId: null,
      status: "failed",
    });
  });

  it("runMessages gets /v1/tasks/:id/runs/:runId/messages", async () => {
    const { fetch, calls } = createMockFetch({
      body: taskRunMessagesPage,
    });
    const c = client(fetch);
    const page = await c.tasks.runMessages(
      "tk_0123456789abcdef",
      "tr_0123456789abcdef",
      { after: "tail", limit: 5 }
    );
    expect(page).toMatchObject({
      error: null,
      finishedAt: null,
      status: "running",
    });
    expect(calls[0].url).toContain("after=tail");
    expect(calls[0].url).toContain("limit=5");
  });

  it.each([
    [{}, ""],
    [{ after: "tail value" }, "?after=tail+value"],
    [{ cursor: "next page" }, "?cursor=next+page"],
    [{ limit: 5 }, "?limit=5"],
    [
      { after: "tail", cursor: "next", limit: 5 },
      "?cursor=next&after=tail&limit=5",
    ],
  ])("serializes run message options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: taskRunMessagesPage,
    });
    await client(fetch).tasks.runMessages(
      "tk_0123456789abcdef",
      "tr_0123456789abcdef",
      options
    );
    expect(calls[0].url).toBe(
      `${BASE}/v1/tasks/tk_0123456789abcdef/runs/tr_0123456789abcdef/messages${suffix}`
    );
  });

  it("cancelRun posts to /v1/tasks/:id/runs/:runId/cancel", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.tasks.cancelRun("tk_0123456789abcdef", "tr_0123456789abcdef");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toBe(
      `${BASE}/v1/tasks/tk_0123456789abcdef/runs/tr_0123456789abcdef/cancel`
    );
  });

  it("rejects malformed success payloads", async () => {
    const { fetch } = createMockFetch({ body: { data: "wrong" } });
    await expect(client(fetch).tasks.list()).rejects.toBeDefined();
  });
});
