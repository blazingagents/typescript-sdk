import { describe, expect, it } from "vitest";
import {
  createMerchantConnectionBodySchema,
  merchantConnectionSchema,
  merchantCustomerBindingSchema,
  merchantGuardSchema,
  merchantUsageEventNextAction,
  merchantUsageEventSchema,
  merchantUsageSummarySchema,
  updateMerchantConnectionBodySchema,
} from "./merchant.ts";

const iso = "2026-09-01T00:00:00.000Z";

const connection = {
  id: "mch_0123456789abcdef",
  provider: "polar",
  environment: "sandbox",
  merchantAccountId: "org_test_account",
  keyFragment: "k1x9",
  guard: { enabled: true, meterId: "meter_1", productIds: ["prod_1"] },
  configVersion: 1,
  createdAt: iso,
  updatedAt: iso,
};

const usageEvent = {
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
  startedAt: iso,
  occurredAt: iso,
  status: "pending",
  payload: null,
  attemptCount: 1,
  attemptGeneration: 1,
  lastAttemptAt: iso,
  lastErrorCode: null,
  acceptedAt: null,
  nextAction: "wait",
};

describe("merchantConnectionSchema", () => {
  it("accepts a complete connection", () => {
    expect(merchantConnectionSchema.parse(connection)).toStrictEqual(
      connection
    );
  });

  it("strips extra fields and never carries a credential", () => {
    const parsed = merchantConnectionSchema.parse({
      ...connection,
      credential: "secret",
    });
    expect(parsed).not.toHaveProperty("credential");
  });

  it("rejects a malformed connection id", () => {
    expect(
      merchantConnectionSchema.safeParse({ ...connection, id: "bad" }).success
    ).toBe(false);
  });
});

describe("merchantGuardSchema", () => {
  it("requires a rule when enabled", () => {
    expect(
      merchantGuardSchema.safeParse({
        enabled: true,
        meterId: null,
        productIds: [],
      }).success
    ).toBe(false);
    expect(
      merchantGuardSchema.safeParse({
        enabled: false,
        meterId: null,
        productIds: [],
      }).success
    ).toBe(true);
  });

  it("rejects duplicate product ids", () => {
    expect(
      merchantGuardSchema.safeParse({
        enabled: true,
        meterId: null,
        productIds: ["prod_1", "prod_1"],
      }).success
    ).toBe(false);
  });
});

describe("merchant connection bodies", () => {
  it("create requires provider, environment and credential", () => {
    expect(
      createMerchantConnectionBodySchema.safeParse({
        credential: "polar_oat_secret",
        environment: "live",
        provider: "polar",
      }).success
    ).toBe(true);
    expect(
      createMerchantConnectionBodySchema.safeParse({ provider: "polar" })
        .success
    ).toBe(false);
  });

  it("update accepts partial fields only", () => {
    expect(updateMerchantConnectionBodySchema.safeParse({}).success).toBe(true);
    expect(
      updateMerchantConnectionBodySchema.safeParse({ status: "active" }).success
    ).toBe(false);
    expect(
      updateMerchantConnectionBodySchema.safeParse({ bogus: 1 }).success
    ).toBe(false);
  });
});

describe("merchantCustomerBindingSchema", () => {
  it("parses a binding", () => {
    const binding = {
      userId: "user-1",
      customerId: "cust_polar_1",
      createdAt: iso,
      updatedAt: iso,
    };
    expect(merchantCustomerBindingSchema.parse(binding)).toStrictEqual(binding);
  });
});

describe("merchantUsageEventSchema", () => {
  it("accepts a complete event", () => {
    expect(merchantUsageEventSchema.parse(usageEvent)).toStrictEqual(
      usageEvent
    );
  });

  it.each(["delivered", "uncertain", "unmapped"])(
    "rejects the unknown status %s",
    (status) => {
      expect(
        merchantUsageEventSchema.safeParse({ ...usageEvent, status }).success
      ).toBe(false);
    }
  );

  it("rejects the removed bind_and_release next action", () => {
    expect(
      merchantUsageEventSchema.safeParse({
        ...usageEvent,
        nextAction: "bind_and_release",
      }).success
    ).toBe(false);
  });

  it("drops the removed workflowIssue field", () => {
    expect(
      merchantUsageEventSchema.parse({
        ...usageEvent,
        workflowIssue: "recovery_exhausted",
      })
    ).toStrictEqual(usageEvent);
  });
});

describe("merchantUsageSummarySchema", () => {
  it("parses the summary aggregate", () => {
    const summary = {
      counts: {
        pending: 1,
        accepted: 2,
        failed: 0,
        incomplete: 0,
        expired: 0,
        discarded: 0,
      },
      lastAcceptedAt: iso,
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
    expect(merchantUsageSummarySchema.parse(summary)).toStrictEqual(summary);
    expect(
      merchantUsageSummarySchema.safeParse({
        ...summary,
        counts: { ...summary.counts, uncertain: 0, unmapped: 0 },
      }).success
    ).toBe(false);
  });
});

describe("merchantUsageEventNextAction", () => {
  it.each([
    [{ status: "accepted", automaticDeliveryStopped: false }, "none"],
    [{ status: "discarded", automaticDeliveryStopped: false }, "none"],
    [{ status: "pending", automaticDeliveryStopped: false }, "wait"],
    [{ status: "pending", automaticDeliveryStopped: true }, "retry"],
    [{ status: "failed", automaticDeliveryStopped: false }, "retry"],
    [{ status: "incomplete", automaticDeliveryStopped: false }, "investigate"],
    [{ status: "expired", automaticDeliveryStopped: false }, "discard"],
  ] as const)("maps %j to %s", (event, expected) => {
    expect(merchantUsageEventNextAction(event)).toBe(expected);
  });
});
