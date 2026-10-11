import { describe, expect, it } from "vitest";

import {
  DEFAULT_USAGE_OVERVIEW_TOP_N,
  DEFAULT_USAGE_RANGE_DAYS,
  DEFAULT_USAGE_SESSION_TOP_N,
  MAX_AGENT_INSTRUCTIONS_LENGTH,
  MAX_AGENT_NAME_LENGTH,
  MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH,
  MAX_MCP_ATTACHMENT_METADATA_KEYS,
  MAX_MCP_CONNECTION_NAME_LENGTH,
  MAX_MCP_CONNECTION_URL_LENGTH,
  MAX_PROMPT_NAME_LENGTH,
  MAX_PROMPT_TEMPLATE_BYTES,
  MAX_PROMPT_VARIABLES,
  MAX_PROMPTS_LIST_LIMIT,
  MAX_PROVIDER_NAME_LENGTH,
  MAX_QUOTA_RESET_DAY,
  MAX_TASK_NAME_LENGTH,
  MAX_TASK_PROMPT_LENGTH,
  MAX_USAGE_OVERVIEW_TOP_N,
  MAX_USAGE_RANGE_DAYS,
  MAX_USAGE_SESSION_TOP_N,
  MIN_QUOTA_RESET_DAY,
  MIN_TASK_INTERVAL_MS,
} from "./limitations.ts";

// Asserts presence without locking values, so tuning a limit does not fail tests.
function expectPositiveInt(value: number) {
  expect(Number.isInteger(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
}

describe("limitations export surface", () => {
  it("exports the prompt caps from ticket 16", () => {
    expectPositiveInt(MAX_PROMPTS_LIST_LIMIT);
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
    expectPositiveInt(MAX_PROVIDER_NAME_LENGTH);
  });

  it("exports the MCP connection caps from ticket 05", () => {
    expectPositiveInt(MAX_MCP_CONNECTION_NAME_LENGTH);
    expectPositiveInt(MAX_MCP_CONNECTION_URL_LENGTH);
  });

  it("exports the MCP Turn runtime limits", () => {
    expect(MAX_MCP_ATTACHMENT_METADATA_KEYS).toBe(32);
    expect(MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH).toBe(64);
  });

  it("exports the agent caps from ticket 07", () => {
    expectPositiveInt(MAX_AGENT_NAME_LENGTH);
    expectPositiveInt(MAX_AGENT_INSTRUCTIONS_LENGTH);
  });

  it("exports the usage range and top-N caps from ticket 09", () => {
    expectPositiveInt(MAX_USAGE_RANGE_DAYS);
    expectPositiveInt(DEFAULT_USAGE_RANGE_DAYS);
    expectPositiveInt(DEFAULT_USAGE_SESSION_TOP_N);
    expectPositiveInt(MAX_USAGE_SESSION_TOP_N);
    expect(DEFAULT_USAGE_OVERVIEW_TOP_N).toBe(5);
    expect(MAX_USAGE_OVERVIEW_TOP_N).toBe(20);
  });

  it("exports the quota reset-day bounds from ticket 09", () => {
    expectPositiveInt(MIN_QUOTA_RESET_DAY);
    expectPositiveInt(MAX_QUOTA_RESET_DAY);
    expect(MIN_QUOTA_RESET_DAY).toBeLessThanOrEqual(MAX_QUOTA_RESET_DAY);
  });
});
