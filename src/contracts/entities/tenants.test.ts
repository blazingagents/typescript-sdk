import { describe, expect, it } from "vitest";

import {
  quotaSchema,
  tenantResponseSchema,
  tenantSchema,
  tenantSettingsResponseSchema,
  updateTenantSettingsBodySchema,
} from "./tenants.ts";

const tenantId = "ten_xxxxxxxxxxxxxxxx";
const authUserId = "11111111-1111-4111-8111-111111111111";
const iso = "2026-07-04T00:00:00.000Z";

describe("tenantSchema", () => {
  it("accepts a complete tenant record", () => {
    expect(
      tenantSchema.parse({
        id: tenantId,
        authUserId,
        email: "dev@example.com",
        name: "Acme",
        createdAt: iso,
        updatedAt: iso,
      })
    ).toStrictEqual({
      id: tenantId,
      authUserId,
      email: "dev@example.com",
      name: "Acme",
      createdAt: iso,
      updatedAt: iso,
    });
  });

  it("rejects extra fields", () => {
    expect(
      tenantSchema.safeParse({
        id: tenantId,
        authUserId,
        email: "dev@example.com",
        name: "Acme",
        createdAt: iso,
        updatedAt: iso,
        extra: true,
      }).success
    ).toBe(false);
  });

  it("rejects a malformed tenant id", () => {
    expect(
      tenantSchema.safeParse({
        id: "nope",
        authUserId,
        email: "dev@example.com",
        name: "Acme",
        createdAt: iso,
        updatedAt: iso,
      }).success
    ).toBe(false);
  });

  it("rejects a non-uuid authUserId (the DB column is uuid)", () => {
    expect(
      tenantSchema.safeParse({
        id: tenantId,
        authUserId: "auth-123",
        email: "dev@example.com",
        name: "Acme",
        createdAt: iso,
        updatedAt: iso,
      }).success
    ).toBe(false);
  });
});

describe("tenantResponseSchema", () => {
  const tenant = {
    id: tenantId,
    authUserId,
    email: "dev@example.com",
    name: "Acme",
    createdAt: iso,
    updatedAt: iso,
  };

  it.each(["active", "inactive"] as const)(
    "exposes provider-neutral %s Subscription status",
    (status) => {
      expect(
        tenantResponseSchema.parse({ ...tenant, subscriptionStatus: status })
      ).toStrictEqual({ ...tenant, subscriptionStatus: status });
    }
  );

  it("rejects provider lifecycle details", () => {
    expect(
      tenantResponseSchema.safeParse({
        ...tenant,
        subscriptionStatus: "active",
        subscriptionProvider: "polar",
      }).success
    ).toBe(false);
    expect(
      tenantResponseSchema.safeParse({
        ...tenant,
        subscriptionStatus: "past_due",
      }).success
    ).toBe(false);
  });
});

describe("quotaSchema", () => {
  it("accepts a full quota with both limits and a reset day", () => {
    expect(
      quotaSchema.parse({
        monthlyTokenLimit: 1_000_000,
        monthlyRequestLimit: 500,
        resetDay: 15,
      })
    ).toStrictEqual({
      monthlyTokenLimit: 1_000_000,
      monthlyRequestLimit: 500,
      resetDay: 15,
    });
  });

  it.each([
    [1_000_000, null],
    [null, 500],
  ])(
    "accepts a quota with one unlimited axis",
    (monthlyTokenLimit, monthlyRequestLimit) => {
      expect(
        quotaSchema.parse({
          monthlyTokenLimit,
          monthlyRequestLimit,
          resetDay: 1,
        })
      ).toStrictEqual({
        monthlyTokenLimit,
        monthlyRequestLimit,
        resetDay: 1,
      });
    }
  );

  it("rejects an all-null quota object", () => {
    expect(
      quotaSchema.safeParse({
        monthlyTokenLimit: null,
        monthlyRequestLimit: null,
        resetDay: 1,
      }).success
    ).toBe(false);
  });

  it("rejects reset days outside 1-28", () => {
    expect(
      quotaSchema.safeParse({
        monthlyTokenLimit: 1,
        monthlyRequestLimit: null,
        resetDay: 0,
      }).success
    ).toBe(false);
    expect(
      quotaSchema.safeParse({
        monthlyTokenLimit: 1,
        monthlyRequestLimit: null,
        resetDay: 29,
      }).success
    ).toBe(false);
  });

  it("rejects non-positive limits", () => {
    expect(
      quotaSchema.safeParse({
        monthlyTokenLimit: 0,
        monthlyRequestLimit: null,
        resetDay: 1,
      }).success
    ).toBe(false);
  });
});

describe("tenantSettingsResponseSchema", () => {
  it("accepts name + quota", () => {
    expect(
      tenantSettingsResponseSchema.parse({
        name: "Acme",
        quota: {
          monthlyTokenLimit: 1000,
          monthlyRequestLimit: 10,
          resetDay: 1,
        },
      })
    ).toStrictEqual({
      name: "Acme",
      quota: {
        monthlyTokenLimit: 1000,
        monthlyRequestLimit: 10,
        resetDay: 1,
      },
    });
  });

  it("accepts name + null quota", () => {
    expect(
      tenantSettingsResponseSchema.parse({ name: "Acme", quota: null })
    ).toStrictEqual({ name: "Acme", quota: null });
  });

  it("trims a padded name (uniform with the update body schema)", () => {
    expect(
      tenantSettingsResponseSchema.parse({ name: "  Acme  ", quota: null })
    ).toStrictEqual({ name: "Acme", quota: null });
  });

  it("rejects a missing name", () => {
    expect(
      tenantSettingsResponseSchema.safeParse({ quota: null }).success
    ).toBe(false);
  });
});

describe("updateTenantSettingsBodySchema", () => {
  it("accepts a quota update", () => {
    expect(
      updateTenantSettingsBodySchema.parse({
        quota: {
          monthlyTokenLimit: 1000,
          monthlyRequestLimit: 10,
          resetDay: 1,
        },
      })
    ).toStrictEqual({
      quota: {
        monthlyTokenLimit: 1000,
        monthlyRequestLimit: 10,
        resetDay: 1,
      },
    });
  });

  it("accepts a name update", () => {
    expect(
      updateTenantSettingsBodySchema.parse({ name: "Renamed" })
    ).toStrictEqual({ name: "Renamed" });
  });

  it("accepts name + quota together", () => {
    expect(
      updateTenantSettingsBodySchema.parse({
        name: "Renamed",
        quota: null,
      })
    ).toStrictEqual({ name: "Renamed", quota: null });
  });

  it("trims and validates the name length", () => {
    expect(
      updateTenantSettingsBodySchema.safeParse({ name: "   " }).success
    ).toBe(false);
    expect(
      updateTenantSettingsBodySchema.safeParse({ name: "x".repeat(81) }).success
    ).toBe(false);
  });

  it("accepts clearing the quota with null", () => {
    expect(updateTenantSettingsBodySchema.parse({ quota: null })).toStrictEqual(
      { quota: null }
    );
  });

  it("rejects empty updates", () => {
    expect(updateTenantSettingsBodySchema.safeParse({}).success).toBe(false);
  });
});
