import { describe, expect, it } from "vitest";

import {
  sessionUsageQuerySchema,
  sessionUsageResponseSchema,
  usageOverviewQuerySchema,
  usageOverviewResponseSchema,
  usageResponseSchema,
} from "./usage.ts";

const totals = {
  inputTokens: 10,
  outputTokens: 5,
  requestCount: 1,
  durationMs: 100,
};

const bucket = {
  day: null,
  agentId: null,
  sessionId: null,
  userId: null,
  provider: null,
  model: null,
  ...totals,
};

const agentId = "ag_xxxxxxxxxxxxxxxx";
const sessionId = "ss_xxxxxxxxxxxxxxxx";

describe("session usage", () => {
  it("requires one to 100 unique session IDs and a valid range", () => {
    const ids = [sessionId];
    expect(sessionUsageQuerySchema.safeParse({ sessionIds: ids }).success).toBe(
      true
    );
    expect(sessionUsageQuerySchema.safeParse({ sessionIds: [] }).success).toBe(
      false
    );
    expect(
      sessionUsageQuerySchema.safeParse({ sessionIds: [sessionId, sessionId] })
        .success
    ).toBe(false);
    expect(
      sessionUsageQuerySchema.safeParse({
        sessionIds: Array.from({ length: 101 }, () => sessionId),
      }).success
    ).toBe(false);
    expect(
      sessionUsageQuerySchema.safeParse({ sessionIds: ids, from: "2026-01-01" })
        .success
    ).toBe(false);
    expect(
      sessionUsageResponseSchema.parse({
        data: [
          {
            sessionId,
            totals: {
              inputTokens: 0,
              outputTokens: 0,
              requestCount: 0,
              durationMs: 0,
            },
          },
        ],
      }).data
    ).toHaveLength(1);
  });
});

describe("usageOverviewQuerySchema", () => {
  it("defaults the ranking limit to five", () => {
    expect(usageOverviewQuerySchema.parse({}).limit).toBe(5);
  });

  it("accepts the maximum ranking limit", () => {
    expect(usageOverviewQuerySchema.parse({ limit: 20 }).limit).toBe(20);
  });

  it("rejects an oversized ranking limit", () => {
    expect(usageOverviewQuerySchema.safeParse({ limit: 21 }).success).toBe(
      false
    );
  });

  it("requires a complete, ordered range of at most 31 days", () => {
    expect(
      usageOverviewQuerySchema.safeParse({
        from: "2026-07-01",
        to: "2026-08-01",
      }).success
    ).toBe(true);
    expect(
      usageOverviewQuerySchema.safeParse({ from: "2026-07-01" }).success
    ).toBe(false);
    expect(
      usageOverviewQuerySchema.safeParse({
        from: "2026-08-01",
        to: "2026-07-01",
      }).success
    ).toBe(false);
    expect(
      usageOverviewQuerySchema.safeParse({
        from: "2026-07-01",
        to: "2026-08-02",
      }).success
    ).toBe(false);
  });
});

describe("usageOverviewResponseSchema", () => {
  it("accepts bounded rankings and an optional model remainder", () => {
    const parsed = usageOverviewResponseSchema.parse({
      totals,
      daily: [{ ...bucket, day: "2026-07-01" }],
      byAgent: [{ ...bucket, agentId: "ag_0123456789abcdef" }],
      byUser: [{ ...bucket, userId: "user-1" }],
      byModel: [{ ...bucket, provider: "openai", model: "gpt-5" }, bucket],
      activeAgentCount: 1,
    });

    expect(parsed.byModel.at(-1)?.model).toBeNull();
    expect(parsed.activeAgentCount).toBe(1);
  });

  it("accepts model usage whose Provider was deleted", () => {
    expect(
      usageOverviewResponseSchema.safeParse({
        totals,
        daily: [],
        byAgent: [],
        byUser: [],
        byModel: [{ ...bucket, model: "historical-model" }],
        activeAgentCount: 0,
      }).success
    ).toBe(true);
  });

  it("rejects a Provider without a model", () => {
    expect(
      usageOverviewResponseSchema.safeParse({
        totals,
        daily: [],
        byAgent: [],
        byUser: [],
        byModel: [{ ...bucket, provider: "openai" }],
        activeAgentCount: 0,
      }).success
    ).toBe(false);
  });

  it("rejects more than 20 normal model buckets", () => {
    const byModel = Array.from({ length: 21 }, (_, index) => ({
      ...bucket,
      provider: "provider",
      model: `model-${index}`,
    }));
    expect(
      usageOverviewResponseSchema.safeParse({
        totals,
        daily: [],
        byAgent: [],
        byUser: [],
        byModel,
        activeAgentCount: 0,
      }).success
    ).toBe(false);
  });

  it("rejects multiple model remainder buckets", () => {
    expect(
      usageOverviewResponseSchema.safeParse({
        totals,
        daily: [],
        byAgent: [],
        byUser: [],
        byModel: [bucket, bucket],
        activeAgentCount: 0,
      }).success
    ).toBe(false);
  });
});

describe("usageResponseSchema", () => {
  it("wraps buckets and non-negative totals", () => {
    expect(usageResponseSchema.parse({ buckets: [], totals })).toStrictEqual({
      buckets: [],
      totals,
    });
  });

  it("accepts a complete bucket", () => {
    expect(
      usageResponseSchema.safeParse({
        buckets: [
          {
            day: "2026-07-04",
            agentId,
            sessionId: null,
            userId: null,
            provider: "prv_xxxxxxxxxxxxxxxx",
            model: "openrouter/test",
            inputTokens: 100,
            outputTokens: 50,
            requestCount: 1,
            durationMs: 1234,
          },
        ],
        totals,
      }).success
    ).toBe(true);
  });

  it("accepts all-null group keys for a totals-only bucket", () => {
    expect(
      usageResponseSchema.safeParse({ buckets: [bucket], totals }).success
    ).toBe(true);
  });

  it("accepts a verbatim '' userId for the tenant-level groupBy=user bucket", () => {
    expect(
      usageResponseSchema.safeParse({
        buckets: [{ ...bucket, userId: "" }],
        totals,
      }).success
    ).toBe(true);
  });

  it("rejects the empty-string sessionId sentinel on the wire (must be null)", () => {
    expect(
      usageResponseSchema.safeParse({
        buckets: [{ ...bucket, sessionId: "" }],
        totals,
      }).success
    ).toBe(false);
  });
});
