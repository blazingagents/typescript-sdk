import { describe, expect, it } from "vitest";

import {
  quotaSchema,
  tenantSettingsResponseSchema,
  updateTenantSettingsBodySchema,
} from "./tenants.ts";

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
  it("accepts name + quota + deletion", () => {
    expect(
      tenantSettingsResponseSchema.parse({
        name: "Acme",
        quota: {
          monthlyTokenLimit: 1000,
          monthlyRequestLimit: 10,
          resetDay: 1,
        },
        deletion: null,
        monetizationEnabled: false,
      })
    ).toStrictEqual({
      name: "Acme",
      quota: {
        monthlyTokenLimit: 1000,
        monthlyRequestLimit: 10,
        resetDay: 1,
      },
      deletion: null,
      monetizationEnabled: false,
    });
  });

  it("accepts name + null quota", () => {
    expect(
      tenantSettingsResponseSchema.parse({
        name: "Acme",
        quota: null,
        deletion: null,
        monetizationEnabled: false,
      })
    ).toStrictEqual({
      name: "Acme",
      quota: null,
      deletion: null,
      monetizationEnabled: false,
    });
  });

  it("trims a padded name (uniform with the update body schema)", () => {
    expect(
      tenantSettingsResponseSchema.parse({
        name: "  Acme  ",
        quota: null,
        deletion: null,
        monetizationEnabled: false,
      })
    ).toStrictEqual({
      name: "Acme",
      quota: null,
      deletion: null,
      monetizationEnabled: false,
    });
  });

  it("parses a tenant deletion state", () => {
    const deletion = {
      requestedAt: "2026-09-01T00:00:00.000Z",
      deletesAt: "2026-09-02T00:00:00.000Z",
    };
    expect(
      tenantSettingsResponseSchema.parse({
        name: "Acme",
        quota: null,
        deletion,
        monetizationEnabled: false,
      }).deletion
    ).toStrictEqual(deletion);
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

it("strips nested quota response additions but rejects them in writes", () => {
  const quota = {
    monthlyTokenLimit: 100,
    monthlyRequestLimit: null,
    resetDay: 1,
  };
  const expanded = { ...quota, futureLimit: 1 };
  expect(
    tenantSettingsResponseSchema.parse({
      name: "Tenant",
      quota: expanded,
      deletion: null,
      monetizationEnabled: false,
    })
  ).toEqual({
    name: "Tenant",
    quota,
    deletion: null,
    monetizationEnabled: false,
  });
  expect(
    updateTenantSettingsBodySchema.safeParse({ quota: expanded }).success
  ).toBe(false);
  expect(
    tenantSettingsResponseSchema.safeParse({
      name: "Tenant",
      quota: { ...expanded, monthlyTokenLimit: null },
      deletion: null,
      monetizationEnabled: false,
    }).success
  ).toBe(false);
});
