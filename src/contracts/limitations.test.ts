import { describe, expect, it } from "vitest";

import {
  API_KEY_BODY_LENGTH,
  API_KEY_FRAGMENT_BODY_LENGTH,
  CLOUDFLARE_SANDBOX_EXEC_MS,
  DEFAULT_SESSION_MESSAGES_LIMIT,
  DEFAULT_SKILLS_LIST_LIMIT,
  DEFAULT_USAGE_RANGE_DAYS,
  DEFAULT_USAGE_SESSION_TOP_N,
  DEFAULT_WORKSPACES_LIST_LIMIT,
  MAX_AGENT_INSTRUCTIONS_LENGTH,
  MAX_AGENT_NAME_LENGTH,
  MAX_API_KEY_NAME_LENGTH,
  MAX_API_KEYS_PER_TENANT,
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_PUBLICATIONS_PER_CALL,
  MAX_ARTIFACTS_PER_SESSION,
  MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH,
  MAX_MCP_ATTACHMENT_METADATA_KEYS,
  MAX_MCP_CONNECTION_NAME_LENGTH,
  MAX_MCP_CONNECTION_TOOL_DEFINITIONS_BYTES,
  MAX_MCP_CONNECTION_URL_LENGTH,
  MAX_MCP_CONNECTIONS_PER_TENANT,
  MAX_MCP_REQUEST_CONTEXT_BYTES,
  MAX_MCP_TOOL_DEFINITION_BYTES,
  MAX_MCP_TOOL_KEY_LENGTH,
  MAX_MCP_TOOLS_PER_TURN,
  MAX_PROMPT_NAME_LENGTH,
  MAX_PROMPT_TEMPLATE_BYTES,
  MAX_PROMPT_VARIABLES,
  MAX_PROMPTS_PER_TENANT,
  MAX_PROVIDER_NAME_LENGTH,
  MAX_PROVIDERS_PER_TENANT,
  MAX_QUOTA_RESET_DAY,
  MAX_SANDBOX_FILE_TRANSFER_BYTES,
  MAX_SANDBOX_OPERATION_HTTP_MS,
  MAX_SANDBOX_REQUEST_BODY_BYTES,
  MAX_SESSION_MESSAGES_LIMIT,
  MAX_SKILL_COMPATIBILITY_LENGTH,
  MAX_SKILL_COPY_DESTINATIONS,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_SKILL_FILES,
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILL_UNCOMPRESSED_BYTES,
  MAX_SKILL_UPLOAD_BYTES,
  MAX_SKILLS_LIST_LIMIT,
  MAX_SKILLS_PER_AGENT,
  MAX_TASK_NAME_LENGTH,
  MAX_TASK_PROMPT_LENGTH,
  MAX_USAGE_RANGE_DAYS,
  MAX_USAGE_SESSION_TOP_N,
  MAX_WORKSPACE_ARCHIVE_ENTRIES,
  MAX_WORKSPACE_NAME_LENGTH,
  MAX_WORKSPACES_LIST_LIMIT,
  MIN_QUOTA_RESET_DAY,
  MIN_TASK_INTERVAL_MS,
  PROVIDER_KEY_FRAGMENT_LENGTH,
  TENANT_CREATION_BURST_LIMIT,
  TENANT_CREATION_BURST_WINDOW_MS,
  TENANT_CREATION_SUSTAINED_LIMIT,
  TENANT_CREATION_SUSTAINED_WINDOW_MS,
} from "./limitations.ts";

/**
 * Each constant is asserted to be a positive integer (or, for byte caps, a
 * positive byte count) without locking its exact value — this catches
 * accidental deletion or rename (the export surface is the test's subject)
 * without making every tuning change a test failure.
 */
function expectPositiveInt(value: number) {
  expect(Number.isInteger(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
}

describe("limitations export surface", () => {
  it("exports the API key caps from ticket 04", () => {
    expectPositiveInt(MAX_API_KEYS_PER_TENANT);
    expectPositiveInt(API_KEY_BODY_LENGTH);
    expectPositiveInt(API_KEY_FRAGMENT_BODY_LENGTH);
    expectPositiveInt(MAX_API_KEY_NAME_LENGTH);
  });

  it("exports the accepted Workspace caps", () => {
    expect(MAX_WORKSPACE_NAME_LENGTH).toBe(80);
    expect(MAX_WORKSPACE_ARCHIVE_ENTRIES).toBe(16_384);
    expect(DEFAULT_WORKSPACES_LIST_LIMIT).toBe(50);
    expect(MAX_WORKSPACES_LIST_LIMIT).toBe(200);
  });

  it("exports the accepted Agent Skill caps", () => {
    expect(MAX_SKILLS_PER_AGENT).toBe(100);
    expect(MAX_SKILL_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_SKILL_UNCOMPRESSED_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_SKILL_FILES).toBe(100);
    expect(MAX_SKILL_NAME_LENGTH).toBe(64);
    expect(MAX_SKILL_DESCRIPTION_LENGTH).toBe(1024);
    expect(MAX_SKILL_COMPATIBILITY_LENGTH).toBe(500);
    expect(MAX_SKILL_COPY_DESTINATIONS).toBe(30);
    expect(DEFAULT_SKILLS_LIST_LIMIT).toBe(50);
    expect(MAX_SKILLS_LIST_LIMIT).toBe(100);
  });

  it("exports the prompt caps from ticket 16", () => {
    expectPositiveInt(MAX_PROMPTS_PER_TENANT);
    expectPositiveInt(MAX_PROMPT_TEMPLATE_BYTES);
    expectPositiveInt(MAX_PROMPT_VARIABLES);
    expectPositiveInt(MAX_PROMPT_NAME_LENGTH);
  });

  it("exports the task caps from ticket 15", () => {
    expectPositiveInt(MAX_TASK_NAME_LENGTH);
    expectPositiveInt(MAX_TASK_PROMPT_LENGTH);
    expectPositiveInt(MIN_TASK_INTERVAL_MS);
  });

  it("exports the provider caps from ticket 12", () => {
    expectPositiveInt(MAX_PROVIDERS_PER_TENANT);
    expectPositiveInt(MAX_PROVIDER_NAME_LENGTH);
    expectPositiveInt(PROVIDER_KEY_FRAGMENT_LENGTH);
  });

  it("exports the MCP connection caps from ticket 05", () => {
    expectPositiveInt(MAX_MCP_CONNECTIONS_PER_TENANT);
    expectPositiveInt(MAX_MCP_CONNECTION_NAME_LENGTH);
    expectPositiveInt(MAX_MCP_CONNECTION_URL_LENGTH);
  });

  it("exports the MCP Turn runtime limits", () => {
    expect(MAX_MCP_TOOLS_PER_TURN).toBe(256);
    expect(MAX_MCP_TOOL_DEFINITION_BYTES).toBe(256 * 1024);
    expect(MAX_MCP_CONNECTION_TOOL_DEFINITIONS_BYTES).toBe(1024 * 1024);
    expect(MAX_MCP_TOOL_KEY_LENGTH).toBe(63);
    expect(MAX_MCP_ATTACHMENT_METADATA_KEYS).toBe(32);
    expect(MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH).toBe(64);
    expect(MAX_MCP_REQUEST_CONTEXT_BYTES).toBe(16 * 1024);
  });

  it("exports the agent caps from ticket 07", () => {
    expectPositiveInt(MAX_AGENT_NAME_LENGTH);
    expectPositiveInt(MAX_AGENT_INSTRUCTIONS_LENGTH);
  });

  it("exports the Tenant resource-creation throughput bounds", () => {
    expectPositiveInt(TENANT_CREATION_BURST_LIMIT);
    expectPositiveInt(TENANT_CREATION_BURST_WINDOW_MS);
    expectPositiveInt(TENANT_CREATION_SUSTAINED_LIMIT);
    expectPositiveInt(TENANT_CREATION_SUSTAINED_WINDOW_MS);
  });

  it("exports the append-only Artifact caps", () => {
    expect(MAX_ARTIFACT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_ARTIFACT_PUBLICATIONS_PER_CALL).toBe(10);
    expect(MAX_ARTIFACTS_PER_SESSION).toBe(100);
  });

  it("exports the Sandbox operation limits", () => {
    expect(CLOUDFLARE_SANDBOX_EXEC_MS).toBe(30_000);
    expect(MAX_SANDBOX_OPERATION_HTTP_MS).toBe(160_000);
    expect(CLOUDFLARE_SANDBOX_EXEC_MS).toBeLessThan(
      MAX_SANDBOX_OPERATION_HTTP_MS
    );
    expect(MAX_SANDBOX_FILE_TRANSFER_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_SANDBOX_REQUEST_BODY_BYTES).toBe(15 * 1024 * 1024);
  });

  it("exports the session message pagination caps from ticket 11", () => {
    expectPositiveInt(DEFAULT_SESSION_MESSAGES_LIMIT);
    expectPositiveInt(MAX_SESSION_MESSAGES_LIMIT);
  });

  it("exports the usage range and top-N caps from ticket 09", () => {
    expectPositiveInt(MAX_USAGE_RANGE_DAYS);
    expectPositiveInt(DEFAULT_USAGE_RANGE_DAYS);
    expectPositiveInt(DEFAULT_USAGE_SESSION_TOP_N);
    expectPositiveInt(MAX_USAGE_SESSION_TOP_N);
  });

  it("exports the quota reset-day bounds from ticket 09", () => {
    expectPositiveInt(MIN_QUOTA_RESET_DAY);
    expectPositiveInt(MAX_QUOTA_RESET_DAY);
    expect(MIN_QUOTA_RESET_DAY).toBeLessThanOrEqual(MAX_QUOTA_RESET_DAY);
  });
});
