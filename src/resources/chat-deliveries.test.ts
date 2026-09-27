import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { BlazingAgentsError } from "../errors.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const delivery = {
  id: "cd_0123456789abcdef",
  kind: "reply",
  status: "confirmed",
  attempt: 1,
  credentialVersion: 2,
  representation: "text",
  diagnostic: null,
  receipts: [{ attempt: 1, messageId: "412" }],
  sessionId: "ss_0123456789abcdef",
  messageId: "message-1",
  approvalId: null,
  threadId: "thread-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:01.000Z",
  connectionId: "cc_0123456789abcdef",
  agentId: "ag_0123456789abcdef",
  platform: "slack",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.chatDeliveries", () => {
  it("lists deliveries without a query by default", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [delivery], nextCursor: null },
    });
    const result = await client(fetch).chatDeliveries.list();
    expect(result.data[0]?.id).toBe(delivery.id);
    expect(result.data[0]?.connectionId).toBe(delivery.connectionId);
    expect(result.nextCursor).toBeNull();
    expect(calls[0].url).toBe(`${BASE}/v1/chat-deliveries`);
  });

  it("serializes a single status filter", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).chatDeliveries.list({ status: ["failed"] });
    expect(calls[0].url).toBe(`${BASE}/v1/chat-deliveries?status=failed`);
  });

  it("serializes multiple statuses as one comma-separated parameter", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).chatDeliveries.list({
      status: ["failed", "ambiguous"],
    });
    expect(calls[0].url).toBe(
      `${BASE}/v1/chat-deliveries?status=failed%2Cambiguous`
    );
  });

  it("omits an empty status filter", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).chatDeliveries.list({ status: [] });
    expect(calls[0].url).toBe(`${BASE}/v1/chat-deliveries`);
  });

  it("passes since, cursor, and limit", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [delivery], nextCursor: "next" },
    });
    const result = await client(fetch).chatDeliveries.list({
      since: "2026-09-01T00:00:00.000Z",
      cursor: "cursor 1",
      limit: 10,
      status: ["failed", "ambiguous"],
    });
    expect(result.nextCursor).toBe("next");
    expect(calls[0].url).toBe(
      `${BASE}/v1/chat-deliveries?since=2026-09-01T00%3A00%3A00.000Z&cursor=cursor+1&limit=10&status=failed%2Cambiguous`
    );
  });

  it("forwards the abort signal", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    const abort = new AbortController();
    await client(fetch).chatDeliveries.list({ abortSignal: abort.signal });
    expect(calls[0].init?.signal).toBe(abort.signal);
    expect(new URL(calls[0].url).searchParams.has("abortSignal")).toBe(false);
  });

  it("rejects an invalid success response as invalid_response", async () => {
    const { fetch } = createMockFetch({ body: { unexpected: true } });
    const error = await client(fetch)
      .chatDeliveries.list()
      .catch((caught: unknown) => caught);
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({ code: "invalid_response", status: 200 });
  });
});
