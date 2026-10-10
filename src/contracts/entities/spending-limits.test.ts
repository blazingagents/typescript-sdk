import { describe, expect, it } from "vitest";
import {
  nextSpendingLimitReset,
  spendingLimitResponseSchema,
  spendingLimitSchema,
  spendingLimitStopDetailsSchema,
  spendingLimitStopEventSchema,
  updateSpendingLimitBodySchema,
} from "./spending-limits.ts";

const config = {
  amountUsd: 25.123_456,
  resetStartDate: "2026-01-31",
  resetInterval: "monthly",
} as const;

describe("spending-limit contracts", () => {
  it("accepts each reset interval and explicit disabling", () => {
    for (const resetInterval of ["daily", "weekly", "biweekly", "monthly"]) {
      expect(
        spendingLimitSchema.parse({ ...config, resetInterval }).resetInterval
      ).toBe(resetInterval);
    }
    expect(
      updateSpendingLimitBodySchema.parse({ spendingLimit: null })
    ).toEqual({ spendingLimit: null });
    expect(
      spendingLimitResponseSchema.parse({
        spendingLimit: null,
        period: null,
        nextResetAt: null,
      }).period
    ).toBeNull();
  });

  it.each([
    0,
    -1,
    0.000_000_1,
    1_000_000_001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects amount %s", (amountUsd) => {
    expect(
      spendingLimitSchema.safeParse({ ...config, amountUsd }).success
    ).toBe(false);
  });

  it.each(["2026-02-30", "2026-1-1", "2026-01-31T00:00:00Z"])(
    "rejects invalid date %s",
    (resetStartDate) => {
      expect(
        spendingLimitSchema.safeParse({ ...config, resetStartDate }).success
      ).toBe(false);
    }
  );

  it("rejects missing update values, unknown fields, and intervals", () => {
    expect(updateSpendingLimitBodySchema.safeParse({}).success).toBe(false);
    expect(
      spendingLimitSchema.safeParse({ ...config, resetInterval: "yearly" })
        .success
    ).toBe(false);
    expect(
      spendingLimitSchema.safeParse({ ...config, unrecognized: true }).success
    ).toBe(false);
  });

  it.each(["exhausted", "reserved", "unpriced", "unknown_usage"])(
    "parses the %s stop reason",
    (reason) => {
      expect(
        spendingLimitStopDetailsSchema.parse({
          scope: "both",
          reason,
          spentUsd: 3,
          reservedUsd: 0,
          availableUsd: 0,
          nextResetAt: null,
        }).reason
      ).toBe(reason);
    }
  );
});

describe("next spending-limit reset", () => {
  it.each([
    ["daily", "2026-01-30T23:59:59Z", "2026-01-31T00:00:00.000Z"],
    ["daily", "2026-01-31T00:00:00Z", "2026-02-01T00:00:00.000Z"],
    ["weekly", "2026-02-01T12:00:00Z", "2026-02-07T00:00:00.000Z"],
    ["biweekly", "2026-02-14T00:00:00Z", "2026-02-28T00:00:00.000Z"],
    ["monthly", "2026-02-01T00:00:00Z", "2026-02-28T00:00:00.000Z"],
    ["monthly", "2026-02-28T00:00:00Z", "2026-03-31T00:00:00.000Z"],
    ["monthly", "2026-12-31T00:00:00Z", "2027-01-31T00:00:00.000Z"],
  ] as const)(
    "returns the next %s UTC boundary",
    (resetInterval, after, expected) => {
      expect(nextSpendingLimitReset({ ...config, resetInterval }, after)).toBe(
        expected
      );
    }
  );

  it("accepts Date instants and preserves leap-year monthly anchors", () => {
    expect(
      nextSpendingLimitReset(
        { resetStartDate: "2028-01-31", resetInterval: "monthly" },
        new Date("2028-02-01T00:00:00Z")
      )
    ).toBe("2028-02-29T00:00:00.000Z");
  });
});

it("validates the complete transient spending-limit event", () => {
  const event = {
    type: "data-model-spending-limit",
    transient: true,
    data: {
      code: "model_spending_limit_exceeded",
      scope: "agent",
      reason: "unknown_usage",
      spentUsd: 5,
      reservedUsd: 0,
      availableUsd: 0,
      nextResetAt: null,
    },
  };
  expect(spendingLimitStopEventSchema.parse(event)).toEqual(event);
  expect(
    spendingLimitStopEventSchema.safeParse({ ...event, transient: false })
      .success
  ).toBe(false);
  expect(
    spendingLimitStopEventSchema.safeParse({
      ...event,
      data: { ...event.data, code: "other" },
    }).success
  ).toBe(false);
  expect(spendingLimitStopDetailsSchema.safeParse(event.data).success).toBe(
    false
  );
});
