import { describe, expect, it } from "vitest";

import {
  agentIdSchema,
  apiKeyTokenSchema,
  functionCallIdSchema,
  isAdminAgentId,
  promptIdSchema,
  sessionIdSchema,
} from "./ids.ts";

describe("id schemas", () => {
  it("identifies only valid Agent ids with the reserved Admin Agent prefix", () => {
    expect(isAdminAgentId("ag_adm0123456789ABC")).toBe(true);
    expect(isAdminAgentId("ag_0123456789abcdef")).toBe(false);
    expect(isAdminAgentId("ag_admshort")).toBe(false);
  });

  it.each([
    ["ag_xxxxxxxxxxxxxxxx", agentIdSchema],
    ["ss_xxxxxxxxxxxxxxxx", sessionIdSchema],
    ["prompt_xxxxxxxxxxxxxxxx", promptIdSchema],
    ["fc_xxxxxxxxxxxxxxxx", functionCallIdSchema],
  ])("accepts a valid %s id", (id, schema) => {
    expect(schema.safeParse(id).success).toBe(true);
  });

  it.each([
    ["ag_", agentIdSchema],
    ["ss_xxxxxxxxxxxxxxx", sessionIdSchema],
    ["prompt_short", promptIdSchema],
    ["prompt_xxxxxxxxxxxxxxx", promptIdSchema],
    ["fc_short", functionCallIdSchema],
  ])("rejects malformed id %s", (id, schema) => {
    expect(schema.safeParse(id).success).toBe(false);
  });

  it("apiKeyTokenSchema accepts ba_read_ and ba_full_ + 40 base62", () => {
    expect(
      apiKeyTokenSchema.safeParse(`ba_read_${"x".repeat(40)}`).success
    ).toBe(true);
    expect(
      apiKeyTokenSchema.safeParse(`ba_full_${"x".repeat(40)}`).success
    ).toBe(true);
  });

  it("apiKeyTokenSchema rejects legacy tokens, wrong length and prefix", () => {
    expect(apiKeyTokenSchema.safeParse(`ba_${"x".repeat(40)}`).success).toBe(
      false
    );
    expect(
      apiKeyTokenSchema.safeParse(`ba_admin_${"x".repeat(40)}`).success
    ).toBe(false);
    expect(
      apiKeyTokenSchema.safeParse(`ba_read_${"x".repeat(39)}`).success
    ).toBe(false);
    expect(
      apiKeyTokenSchema.safeParse(`xx_read_${"x".repeat(40)}`).success
    ).toBe(false);
  });
});
