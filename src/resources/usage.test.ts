import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const usageResponse = {
  buckets: [
    {
      day: "2026-01-01",
      agentId: null,
      sessionId: null,
      userId: null,
      provider: "openrouter",
      model: "test",
      inputTokens: 10,
      outputTokens: 5,
      requestCount: 1,
      durationMs: 100,
    },
  ],
  totals: {
    inputTokens: 10,
    outputTokens: 5,
    requestCount: 1,
    durationMs: 100,
  },
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.usage", () => {
  it("get queries /v1/usage with the query params", async () => {
    const { fetch, calls } = createMockFetch({ body: usageResponse });
    const c = client(fetch);
    const result = await c.usage.get({
      from: "2026-01-01",
      to: "2026-01-31",
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      groupBy: "day",
      limit: 50,
    });
    expect(result.totals.requestCount).toBe(1);
    expect(calls[0].url).toContain("from=2026-01-01");
    expect(calls[0].url).toContain("to=2026-01-31");
    expect(calls[0].url).toContain("agentId=ag_0123456789abcdef");
    expect(calls[0].url).toContain("sessionId=ss_0123456789abcdef");
    expect(calls[0].url).toContain("groupBy=day");
    expect(calls[0].url).toContain("limit=50");
  });

  it("getForAgent queries /v1/agents/:id/usage", async () => {
    const { fetch, calls } = createMockFetch({ body: usageResponse });
    const c = client(fetch);
    await c.usage.getForAgent("ag_0123456789abcdef", { groupBy: "agent" });
    expect(calls[0].url).toContain("/v1/agents/ag_0123456789abcdef/usage");
    expect(calls[0].url).toContain("groupBy=agent");
  });

  it("get with no query uses defaults", async () => {
    const { fetch, calls } = createMockFetch({ body: usageResponse });
    const c = client(fetch);
    await c.usage.get();
    expect(calls[0].url).toBe(`${BASE}/v1/usage`);
  });
});
