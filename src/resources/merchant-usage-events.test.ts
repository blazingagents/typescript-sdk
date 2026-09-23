import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const event = {
  id: "mev_0123456789abcdef",
  turnId: "turn_0123456789abcdef",
  connectionId: "mch_0123456789abcdef",
  provider: "polar",
  userId: "user-1",
  customerId: "cust_polar_1",
  agentId: "ag_0123456789abcdef",
  sessionId: "ss_0123456789abcdef",
  model: "test-model",
  modelProvider: "openrouter",
  inputTokens: 10,
  outputTokens: 20,
  totalTokens: 30,
  turnStatus: "succeeded",
  startedAt: "2026-09-01T00:00:00.000Z",
  occurredAt: "2026-09-01T00:00:01.000Z",
  status: "pending",
  payload: null,
  attemptCount: 1,
  attemptGeneration: 1,
  lastAttemptAt: "2026-09-01T00:00:01.000Z",
  lastErrorCode: null,
  acceptedAt: null,
  workflowIssue: null,
  nextAction: "wait",
};
const summary = {
  counts: {
    pending: 1,
    accepted: 2,
    uncertain: 0,
    failed: 0,
    unmapped: 0,
    incomplete: 0,
    expired: 0,
    discarded: 0,
  },
  lastAcceptedAt: "2026-09-01T00:00:02.000Z",
  oldestPendingOccurredAt: null,
  daily: [
    {
      day: "2026-09-01",
      acceptedEvents: 2,
      acceptedTokens: 60,
      pendingEvents: 1,
    },
  ],
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.merchantUsageEvents", () => {
  it("lists events with the status filter and pagination", async () => {
    const { fetch, calls } = createMockFetch({
      body: { events: [event], nextCursor: "next" },
    });
    const result = await client(fetch).merchantUsageEvents.list({
      cursor: "cursor 1",
      limit: 10,
      status: "pending",
    });
    expect(result.events[0]?.id).toBe(event.id);
    expect(result.nextCursor).toBe("next");
    expect(calls[0].url).toBe(
      `${BASE}/v1/merchant-usage-events?cursor=cursor+1&limit=10&status=pending`
    );
  });

  it("gets a single event", async () => {
    const { fetch, calls } = createMockFetch({ body: { event } });
    const result = await client(fetch).merchantUsageEvents.get({
      eventId: event.id,
    });
    expect(result.event.nextAction).toBe("wait");
    expect(calls[0].url).toBe(`${BASE}/v1/merchant-usage-events/${event.id}`);
  });

  it("summary passes the days window", async () => {
    const { fetch, calls } = createMockFetch({ body: { summary } });
    const result = await client(fetch).merchantUsageEvents.summary({
      days: 7,
    });
    expect(result.summary.counts.accepted).toBe(2);
    expect(result.summary.daily[0]?.day).toBe("2026-09-01");
    expect(calls[0].url).toBe(
      `${BASE}/v1/merchant-usage-events/summary?days=7`
    );
  });

  it("summary defaults to no query", async () => {
    const { fetch, calls } = createMockFetch({ body: { summary } });
    await client(fetch).merchantUsageEvents.summary();
    expect(calls[0].url).toBe(`${BASE}/v1/merchant-usage-events/summary`);
  });

  it.each(["retry", "release", "discard"] as const)(
    "%s posts to the event action",
    async (action) => {
      const { fetch, calls } = createMockFetch({
        body: { event: { ...event, status: "pending" } },
      });
      const result = await client(fetch).merchantUsageEvents[action]({
        eventId: event.id,
      });
      expect(result.event.id).toBe(event.id);
      expect(calls[0].url).toBe(
        `${BASE}/v1/merchant-usage-events/${event.id}/${action}`
      );
      expect(calls[0].init?.method).toBe("POST");
    }
  );

  it("surfaces state conflicts", async () => {
    const { fetch } = createMockFetch({
      body: {
        error: {
          code: "merchant_event_state_conflict",
          message: "Event is already accepted.",
        },
      },
      status: 409,
    });
    await expect(
      client(fetch).merchantUsageEvents.retry({ eventId: event.id })
    ).rejects.toMatchObject({
      code: "merchant_event_state_conflict",
      status: 409,
    });
  });
});
