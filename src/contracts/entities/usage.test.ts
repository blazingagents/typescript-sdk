import { describe, expect, it } from "vitest";

import {
  usageBucketSchema,
  usageGroupBySchema,
  usageOverviewQuerySchema,
  usageOverviewResponseSchema,
  usageQuerySchema,
  usageResponseSchema,
  usageSessionFilterSchema,
  usageTotalsSchema,
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

describe("usageGroupBySchema", () => {
  it("accepts the five groupBy values and defaults to day", () => {
    expect(usageGroupBySchema.parse(undefined)).toBe("day");
    for (const g of ["day", "agent", "model", "session", "user"] as const) {
      expect(usageGroupBySchema.parse(g)).toBe(g);
    }
  });

  it("rejects unknown groupBy", () => {
    expect(usageGroupBySchema.safeParse("hour").success).toBe(false);
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

describe("usageSessionFilterSchema", () => {
  it("accepts a real session id", () => {
    expect(usageSessionFilterSchema.safeParse(sessionId).success).toBe(true);
  });

  it("accepts the empty-string sentinel for stateless turns", () => {
    expect(usageSessionFilterSchema.safeParse("").success).toBe(true);
  });

  it("rejects a malformed session id", () => {
    expect(usageSessionFilterSchema.safeParse("ss_short").success).toBe(false);
  });
});

describe("usageQuerySchema", () => {
  it("defaults limit to 50", () => {
    expect(usageQuerySchema.parse({}).limit).toBe(50);
  });

  it("defaults groupBy to day", () => {
    expect(usageQuerySchema.parse({}).groupBy).toBe("day");
  });

  it("rejects a limit over 200", () => {
    expect(usageQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it("accepts an agentId filter", () => {
    expect(usageQuerySchema.parse({ agentId }).agentId).toBe(agentId);
  });

  it("accepts the empty-string sessionId sentinel", () => {
    expect(usageQuerySchema.parse({ sessionId: "" }).sessionId).toBe("");
  });

  it("accepts a real sessionId filter", () => {
    expect(usageQuerySchema.parse({ sessionId }).sessionId).toBe(sessionId);
  });

  it("accepts a userId filter (opaque string, including '')", () => {
    expect(usageQuerySchema.parse({ userId: "u-42" }).userId).toBe("u-42");
    expect(usageQuerySchema.parse({ userId: "" }).userId).toBe("");
  });

  it("accepts groupBy=user", () => {
    expect(usageQuerySchema.parse({ groupBy: "user" }).groupBy).toBe("user");
  });

  it("accepts date strings for from/to", () => {
    const parsed = usageQuerySchema.parse({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(parsed.from).toBe("2026-07-01");
    expect(parsed.to).toBe("2026-07-31");
  });

  it("rejects a range over 31 days", () => {
    expect(
      usageQuerySchema.safeParse({
        from: "2026-07-01",
        to: "2026-08-10",
      }).success
    ).toBe(false);
  });

  it("accepts a 31-day range", () => {
    expect(
      usageQuerySchema.safeParse({
        from: "2026-07-01",
        to: "2026-08-01",
      }).success
    ).toBe(true);
  });

  it("rejects to before from", () => {
    expect(
      usageQuerySchema.safeParse({
        from: "2026-07-10",
        to: "2026-07-01",
      }).success
    ).toBe(false);
  });

  it("rejects a partial range with only from", () => {
    expect(usageQuerySchema.safeParse({ from: "2026-07-01" }).success).toBe(
      false
    );
  });

  it("rejects a partial range with only to", () => {
    expect(usageQuerySchema.safeParse({ to: "2026-07-31" }).success).toBe(
      false
    );
  });

  it("rejects extra fields", () => {
    expect(usageQuerySchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe("usageBucketSchema", () => {
  it("accepts a complete bucket", () => {
    expect(
      usageBucketSchema.safeParse({
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
      }).success
    ).toBe(true);
  });

  it("accepts all-null group keys for a totals-only bucket", () => {
    expect(
      usageBucketSchema.safeParse({
        day: null,
        agentId: null,
        sessionId: null,
        userId: null,
        provider: null,
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        durationMs: 0,
      }).success
    ).toBe(true);
  });

  it("accepts a verbatim '' userId for the tenant-level groupBy=user bucket", () => {
    expect(
      usageBucketSchema.safeParse({
        day: null,
        agentId: null,
        sessionId: null,
        userId: "",
        provider: null,
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        durationMs: 0,
      }).success
    ).toBe(true);
  });

  it("rejects the empty-string sessionId sentinel on the wire (must be null)", () => {
    expect(
      usageBucketSchema.safeParse({
        day: null,
        agentId: null,
        sessionId: "",
        userId: null,
        provider: null,
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        durationMs: 0,
      }).success
    ).toBe(false);
  });
});

describe("usageTotalsSchema", () => {
  it("accepts non-negative totals", () => {
    expect(
      usageTotalsSchema.parse({
        inputTokens: 100,
        outputTokens: 50,
        requestCount: 1,
        durationMs: 1234,
      })
    ).toStrictEqual({
      inputTokens: 100,
      outputTokens: 50,
      requestCount: 1,
      durationMs: 1234,
    });
  });
});

describe("usageResponseSchema", () => {
  it("wraps buckets + totals", () => {
    expect(
      usageResponseSchema.safeParse({
        buckets: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          requestCount: 0,
          durationMs: 0,
        },
      }).success
    ).toBe(true);
  });
});
