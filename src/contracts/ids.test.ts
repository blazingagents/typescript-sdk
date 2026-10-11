import { describe, expect, it } from "vitest";

import {
  agentIdSchema,
  apiKeyTokenSchema,
  artifactIdSchema,
  isAdminAgentId,
  mcpConnectionIdSchema,
  memoryIdSchema,
  promptIdSchema,
  providerIdSchema,
  providerKeyFragmentSchema,
  sessionIdSchema,
  skillIdSchema,
  taskIdSchema,
  taskRunIdSchema,
  tenantIdSchema,
  turnIdSchema,
  workspaceIdSchema,
} from "./ids.ts";

describe("id schemas", () => {
  it("identifies only valid Agent ids with the reserved Admin Agent prefix", () => {
    expect(isAdminAgentId("ag_adm0123456789ABC")).toBe(true);
    expect(isAdminAgentId("ag_0123456789abcdef")).toBe(false);
    expect(isAdminAgentId("ag_admshort")).toBe(false);
  });

  it.each([
    ["ten_xxxxxxxxxxxxxxxx", tenantIdSchema],
    ["ag_xxxxxxxxxxxxxxxx", agentIdSchema],
    ["ss_xxxxxxxxxxxxxxxx", sessionIdSchema],
    ["prv_xxxxxxxxxxxxxxxx", providerIdSchema],
    ["mcp_xxxxxxxxxxxxxxxx", mcpConnectionIdSchema],
    ["ws_xxxxxxxxxxxxxxxx", workspaceIdSchema],
    ["at_xxxxxxxxxxxxxxxx", artifactIdSchema],
    ["tk_xxxxxxxxxxxxxxxx", taskIdSchema],
    ["tr_xxxxxxxxxxxxxxxx", taskRunIdSchema],
    ["mem_xxxxxxxxxxxxxxxx", memoryIdSchema],
    ["prompt_xxxxxxxxxxxxxxxx", promptIdSchema],
    ["turn_xxxxxxxxxxxxxxxx", turnIdSchema],
  ])("accepts a valid %s id", (id, schema) => {
    expect(schema.safeParse(id).success).toBe(true);
  });

  it.each([
    ["ten_short", tenantIdSchema],
    ["ag_", agentIdSchema],
    ["ss_xxxxxxxxxxxxxxx", sessionIdSchema],
    ["wrong_xxxxxxxxxxxxxxxx", providerIdSchema],
    ["wrong_xxxxxxxxxxxxxxxx", mcpConnectionIdSchema],
    ["sb_xxxxxxxxxxxxxxxx", workspaceIdSchema],
    ["mem_short", memoryIdSchema],
    ["prompt_short", promptIdSchema],
    ["prompt_xxxxxxxxxxxxxxx", promptIdSchema],
    ["turn_short", turnIdSchema],
  ])("rejects malformed id %s", (id, schema) => {
    expect(schema.safeParse(id).success).toBe(false);
  });

  it("skillIdSchema accepts ordinary Agent Skill ids", () => {
    expect(skillIdSchema.safeParse("skill_0123456789abcdef").success).toBe(
      true
    );
  });

  it("skillIdSchema rejects malformed and platform ids", () => {
    expect(skillIdSchema.safeParse("skill_short").success).toBe(false);
    expect(skillIdSchema.safeParse("skill_platform_").success).toBe(false);
    expect(skillIdSchema.safeParse("skill_platform_Bad").success).toBe(false);
    expect(skillIdSchema.safeParse("skill_platform_airtable").success).toBe(
      false
    );
  });

  it("apiKeyTokenSchema accepts ba_ + 40 base62", () => {
    expect(apiKeyTokenSchema.safeParse(`ba_${"x".repeat(40)}`).success).toBe(
      true
    );
  });

  it("apiKeyTokenSchema rejects wrong length and prefix", () => {
    expect(apiKeyTokenSchema.safeParse(`ba_${"x".repeat(39)}`).success).toBe(
      false
    );
    expect(apiKeyTokenSchema.safeParse(`xx_${"x".repeat(40)}`).success).toBe(
      false
    );
  });

  it("providerKeyFragmentSchema accepts 1-4 chars", () => {
    expect(providerKeyFragmentSchema.safeParse("a").success).toBe(true);
    expect(providerKeyFragmentSchema.safeParse("abcd").success).toBe(true);
  });

  it("providerKeyFragmentSchema rejects empty or overlong", () => {
    expect(providerKeyFragmentSchema.safeParse("").success).toBe(false);
    expect(providerKeyFragmentSchema.safeParse("abcde").success).toBe(false);
  });
});
