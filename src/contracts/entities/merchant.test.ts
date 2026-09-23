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
  status: "active",
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
  workflowIssue: null,
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
      updateMerchantConnectionBodySchema.safeParse({
        status: "disconnected",
      }).success
    ).toBe(true);
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

  it("rejects an unknown status", () => {
    expect(
      merchantUsageEventSchema.safeParse({
        ...usageEvent,
        status: "delivered",
      }).success
    ).toBe(false);
  });
});

describe("merchantUsageSummarySchema", () => {
  it("parses the summary aggregate", () => {
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
  });
});

describe("merchantUsageEventNextAction", () => {
  it.each([
    [{ status: "accepted", workflowIssue: null }, "none"],
    [{ status: "discarded", workflowIssue: null }, "none"],
    [{ status: "pending", workflowIssue: null }, "wait"],
    [{ status: "pending", workflowIssue: "recovery_exhausted" }, "retry"],
    [{ status: "failed", workflowIssue: null }, "retry"],
    [{ status: "uncertain", workflowIssue: null }, "retry"],
    [{ status: "unmapped", workflowIssue: null }, "bind_and_release"],
    [{ status: "incomplete", workflowIssue: null }, "investigate"],
    [{ status: "expired", workflowIssue: null }, "discard"],
  ] as const)("maps %j to %s", (event, expected) => {
    expect(merchantUsageEventNextAction(event)).toBe(expected);
  });
});
