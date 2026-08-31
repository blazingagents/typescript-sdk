import { describe, expect, it } from "vitest";

import {
  agentIdSchema,
  apiKeyDigestSchema,
  apiKeyFragmentFromToken,
  apiKeyFragmentSchema,
  apiKeyIdSchema,
  apiKeyTokenSchema,
  artifactIdSchema,
  checkoutAttemptIdSchema,
  createAgentId,
  createApiKeyId,
  createApiKeyToken,
  createArtifactId,
  createCheckoutAttemptId,
  createMcpConnectionId,
  createMemoryId,
  createPromptId,
  createProviderId,
  createRequestId,
  createSessionId,
  createSkillId,
  createTaskId,
  createTaskRunId,
  createTenantId,
  createWorkspaceId,
  isAdminAgentId,
  mcpConnectionIdSchema,
  memoryIdSchema,
  mintAdminAgentId,
  promptIdSchema,
  providerIdSchema,
  providerKeyFragmentSchema,
  requestIdSchema,
  sessionIdSchema,
  skillIdSchema,
  taskIdSchema,
  taskRunIdSchema,
  tenantIdSchema,
  turnIdSchema,
  workspaceIdSchema,
} from "./ids.ts";

const SKILL_ID_PATTERN = /^skill_[0-9A-Za-z]{16}$/;
const API_KEY_TOKEN_PATTERN = /^ba_[0-9A-Za-z]{40}$/;

describe("platform id generators", () => {
  it.each([
    ["createTenantId", createTenantId, "ten_"],
    ["createAgentId", createAgentId, "ag_"],
    ["createSessionId", createSessionId, "ss_"],
    ["createApiKeyId", createApiKeyId, "ak_"],
    ["createProviderId", createProviderId, "prv_"],
    ["createMcpConnectionId", createMcpConnectionId, "mcp_"],
    ["createWorkspaceId", createWorkspaceId, "ws_"],
    ["createArtifactId", createArtifactId, "at_"],
    ["createTaskId", createTaskId, "tk_"],
    ["createTaskRunId", createTaskRunId, "tr_"],
    ["createMemoryId", createMemoryId, "mem_"],
    ["createPromptId", createPromptId, "prompt_"],
    ["createRequestId", createRequestId, "req_"],
    ["createCheckoutAttemptId", createCheckoutAttemptId, "ca_"],
  ])(
    "%s emits a 16-char base62 body with the right prefix",
    (_name, fn, prefix) => {
      const id = fn();
      const pattern = new RegExp(`^${prefix}[0-9A-Za-z]{16}$`);
      expect(id).toMatch(pattern);
    }
  );

  it("createSkillId emits an Agent Skill id", () => {
    expect(createSkillId()).toMatch(SKILL_ID_PATTERN);
  });

  it("generates unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createSessionId()));
    expect(ids.size).toBe(100);
  });

  it("keeps tenant-created Agent ids outside the reserved Admin prefix", () => {
    expect(isAdminAgentId(createAgentId())).toBe(false);
    expect(isAdminAgentId(mintAdminAgentId())).toBe(true);
  });
});

describe("api key token + fragment", () => {
  it("createApiKeyToken emits ba_ + 40 base62 chars", () => {
    expect(createApiKeyToken()).toMatch(API_KEY_TOKEN_PATTERN);
  });

  it("apiKeyFragmentFromToken returns ba_ + first 2 body chars", () => {
    const token = "ba_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij1234567890abcd";
    expect(apiKeyFragmentFromToken(token)).toBe("ba_AB");
  });

  it("apiKeyFragmentFromToken throws on a non-ba_ token", () => {
    expect(() => apiKeyFragmentFromToken("nope_abcdef")).toThrow(
      "API key token must start with ba_."
    );
  });
});

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
    ["ak_xxxxxxxxxxxxxxxx", apiKeyIdSchema],
    ["prv_xxxxxxxxxxxxxxxx", providerIdSchema],
    ["mcp_xxxxxxxxxxxxxxxx", mcpConnectionIdSchema],
    ["ws_xxxxxxxxxxxxxxxx", workspaceIdSchema],
    ["at_xxxxxxxxxxxxxxxx", artifactIdSchema],
    ["tk_xxxxxxxxxxxxxxxx", taskIdSchema],
    ["tr_xxxxxxxxxxxxxxxx", taskRunIdSchema],
    ["mem_xxxxxxxxxxxxxxxx", memoryIdSchema],
    ["prompt_xxxxxxxxxxxxxxxx", promptIdSchema],
    ["req_xxxxxxxxxxxxxxxx", requestIdSchema],
    ["ca_xxxxxxxxxxxxxxxx", checkoutAttemptIdSchema],
    ["turn_xxxxxxxxxxxxxxxx", turnIdSchema],
  ])("accepts a valid %s id", (id, schema) => {
    expect(schema.safeParse(id).success).toBe(true);
  });

  it.each([
    ["ten_short", tenantIdSchema],
    ["ag_", agentIdSchema],
    ["ss_xxxxxxxxxxxxxxx", sessionIdSchema],
    ["ak_xxxxxxxxxxxxxxxxZ", apiKeyIdSchema],
    ["wrong_xxxxxxxxxxxxxxxx", providerIdSchema],
    ["wrong_xxxxxxxxxxxxxxxx", mcpConnectionIdSchema],
    ["sb_xxxxxxxxxxxxxxxx", workspaceIdSchema],
    ["mem_short", memoryIdSchema],
    ["prompt_short", promptIdSchema],
    ["prompt_xxxxxxxxxxxxxxx", promptIdSchema],
    ["req_short", requestIdSchema],
    ["ca_short", checkoutAttemptIdSchema],
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

  it("apiKeyDigestSchema accepts 64 hex chars", () => {
    expect(apiKeyDigestSchema.safeParse("a".repeat(64)).success).toBe(true);
  });

  it("apiKeyDigestSchema rejects non-hex or wrong length", () => {
    expect(apiKeyDigestSchema.safeParse("g".repeat(64)).success).toBe(false);
    expect(apiKeyDigestSchema.safeParse("a".repeat(63)).success).toBe(false);
  });

  it("apiKeyFragmentSchema accepts ba_ + 2 base62", () => {
    expect(apiKeyFragmentSchema.safeParse("ba_AB").success).toBe(true);
  });

  it("apiKeyFragmentSchema rejects wrong shapes", () => {
    expect(apiKeyFragmentSchema.safeParse("ba_A").success).toBe(false);
    expect(apiKeyFragmentSchema.safeParse("ba_ABC").success).toBe(false);
    expect(apiKeyFragmentSchema.safeParse("xx_AB").success).toBe(false);
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
