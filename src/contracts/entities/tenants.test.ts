import { describe, expect, it } from "vitest";

import {
  tenantSettingsResponseSchema,
  updateTenantSettingsBodySchema,
} from "./tenants.ts";

describe("tenantSettingsResponseSchema", () => {
  it("accepts name + deletion", () => {
    expect(
      tenantSettingsResponseSchema.parse({
        name: "Acme",
        deletion: null,
        monetizationEnabled: false,
      })
    ).toStrictEqual({
      name: "Acme",
      deletion: null,
      monetizationEnabled: false,
    });
  });

  it("trims a padded name (uniform with the update body schema)", () => {
    expect(
      tenantSettingsResponseSchema.parse({
        name: "  Acme  ",
        deletion: null,
        monetizationEnabled: false,
      })
    ).toStrictEqual({
      name: "Acme",
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
        deletion,
        monetizationEnabled: false,
      }).deletion
    ).toStrictEqual(deletion);
  });

  it("rejects a missing name", () => {
    expect(tenantSettingsResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("updateTenantSettingsBodySchema", () => {
  it("accepts a name update", () => {
    expect(
      updateTenantSettingsBodySchema.parse({ name: "Renamed" })
    ).toStrictEqual({ name: "Renamed" });
  });

  it("accepts name + monetization together", () => {
    expect(
      updateTenantSettingsBodySchema.parse({
        name: "Renamed",
        monetizationEnabled: true,
      })
    ).toStrictEqual({ name: "Renamed", monetizationEnabled: true });
  });

  it("trims and validates the name length", () => {
    expect(
      updateTenantSettingsBodySchema.safeParse({ name: "   " }).success
    ).toBe(false);
    expect(
      updateTenantSettingsBodySchema.safeParse({ name: "x".repeat(81) }).success
    ).toBe(false);
  });

  it("rejects the removed quota field", () => {
    expect(
      updateTenantSettingsBodySchema.safeParse({ name: "Acme", quota: null })
        .success
    ).toBe(false);
  });

  it("rejects empty updates", () => {
    expect(updateTenantSettingsBodySchema.safeParse({}).success).toBe(false);
  });
});
