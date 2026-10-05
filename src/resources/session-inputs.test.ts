import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const target = {
  agentId: "ag_0123456789abcdef",
  sessionId: "ss_0123456789abcdef",
};
const turnId = "turn_0123456789abcdef";
const base = "http://localhost:8787";
const path = `${base}/v1/agents/${target.agentId}/sessions/${target.sessionId}`;
const message = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Compare costs" }],
};
const activity = { state: "running", turnId };
const data = {
  requestId: "draft/one?two#three",
  sequence: 1,
  message,
  state: "accepted",
  turnId,
  createdAt: "2026-10-04T10:00:00Z",
  updatedAt: "2026-10-04T10:00:00Z",
  reason: null,
};
const response = { data, activity };
function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: base, fetch });
}

describe("durable session inputs", () => {
  it.each(["submitInput", "inputs", "stop"] as const)(
    "%s rejects unsafe Agent and Session IDs before fetch",
    async (method) => {
      const { fetch, calls } = createMockFetch({ body: response });
      const sessions = client(fetch).forUser("alice").sessions;
      for (const field of ["agentId", "sessionId"] as const) {
        for (const value of [
          "",
          ".",
          "..",
          "%2e%2e",
          "../../ag_OTHER/sessions/ss_y",
          "id/child",
          "id?query",
          "id#fragment",
          "ss_short",
          "turn_0123456789abcdef",
        ]) {
          await expect(
            sessions[method]({
              ...target,
              [field]: value,
              requestId: data.requestId,
              message,
              turnId,
            })
          ).rejects.toBeInstanceOf(z.ZodError);
        }
      }
      expect(calls).toHaveLength(0);
    }
  );

  it("stop rejects unsafe Turn IDs before fetch", async () => {
    const { fetch, calls } = createMockFetch({ body: response });
    for (const value of [
      "",
      ".",
      "..",
      "%2e%2e",
      "../tool-approvals",
      "turn_0123456789abcdef?query",
      "turn_0123456789abcdef#fragment",
      "turn_short",
      target.sessionId,
    ]) {
      await expect(
        client(fetch).sessions.stop({ ...target, turnId: value })
      ).rejects.toBeInstanceOf(z.ZodError);
    }
    expect(calls).toHaveLength(0);
  });

  it("accepts the authoritative Admin Agent ID shape", async () => {
    const { fetch, calls } = createMockFetch({ body: response });
    const agentId = "ag_adm0123456789abc";
    await client(fetch).sessions.submitInput({
      ...target,
      agentId,
      requestId: data.requestId,
      message,
    });
    expect(calls[0].url).toBe(
      `${base}/v1/agents/${agentId}/sessions/${target.sessionId}/inputs`
    );
  });

  it("preserves request identity and payload across retries and user scoping", async () => {
    const { fetch, calls } = createMockFetch({ body: response, status: 202 });
    const scoped = client(fetch).forUser("alice");
    const input = { ...target, requestId: data.requestId, message };
    await expect(scoped.sessions.submitInput(input)).resolves.toEqual(response);
    await scoped.sessions.submitInput(input);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.init?.body)).toEqual([
      JSON.stringify({ requestId: data.requestId, message }),
      JSON.stringify({ requestId: data.requestId, message }),
    ]);
    expect(calls[0].url).toBe(`${path}/inputs`);
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("X-BA-User-Id")).toBe(
      "alice"
    );
  });

  it("submits steering with caller cancellation without serializing the signal", async () => {
    const { fetch, calls } = createMockFetch({ body: response });
    const abortSignal = new AbortController().signal;
    await client(fetch).sessions.submitInput({
      ...target,
      requestId: data.requestId,
      message,
      abortSignal,
    });
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ requestId: data.requestId, message })
    );
    expect(calls[0].init?.signal).toBe(abortSignal);
  });

  it("recovers ordered receipts with a pagination cursor and background activity", async () => {
    const body = {
      data: [
        data,
        { ...data, requestId: "second", sequence: 2, state: "uncertain" },
      ],
      nextCursor: "next",
      activity,
    };
    const { fetch, calls } = createMockFetch({ body });
    await expect(
      client(fetch).sessions.inputs({
        ...target,
        includeCompleted: false,
        limit: 200,
        cursor: "a+/=",
      })
    ).resolves.toEqual(body);
    expect(calls[0].url).toBe(
      `${path}/inputs?includeCompleted=false&limit=200&cursor=a%2B%2F%3D`
    );
    await client(fetch).sessions.inputs(target);
    expect(calls[1].url).toBe(`${path}/inputs`);
  });

  it("fences Stop to one Turn while reporting its running successor", async () => {
    const body = {
      stoppedTurnId: turnId,
      activity: { ...activity, turnId: "turn_abcdefghijklmnop" },
    };
    const { fetch, calls } = createMockFetch({ body });
    await expect(
      client(fetch).sessions.stop({ ...target, turnId })
    ).resolves.toEqual(body);
    expect(calls[0].url).toBe(`${path}/stop`);
    expect(calls[0].init?.body).toBe(JSON.stringify({ turnId }));
  });

  it.each([
    "input_idempotency_conflict",
    "steer_not_available",
    "session_busy",
  ])("preserves %s without retrying or fabricating identity", async (code) => {
    const { fetch, calls } = createMockFetch({
      status: 409,
      body: { error: { code, message: "Conflict" } },
    });
    await expect(
      client(fetch).sessions.submitInput({
        ...target,
        requestId: data.requestId,
        message,
      })
    ).rejects.toMatchObject({ code, status: 409 });
    expect(calls).toHaveLength(1);
  });

  it("rejects malformed receipt responses", async () => {
    const { fetch } = createMockFetch({
      body: { data: { ...data, sequence: -1 }, activity },
    });
    await expect(
      client(fetch).sessions.submitInput({
        ...target,
        requestId: data.requestId,
        message,
      })
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
