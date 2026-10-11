/**
 * Effort-wide convention: every coded limit lives here as an UPPER_SNAKE_CASE
 * constant. No scattered magic numbers.
 */

export const MAX_WORKSPACE_NAME_LENGTH = 80;

/**
 * Agent Skills — frontmatter follows the Agent Skills specification accepted
 * in ADR-0028.
 */
export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_COPY_DESTINATIONS = 30;

export const DEFAULT_PROMPTS_LIST_LIMIT = 50;
export const MAX_PROMPTS_LIST_LIMIT = 100;
export const MAX_PROMPT_TEMPLATE_BYTES = 10 * 1024;
export const MAX_PROMPT_VARIABLES = 10;
export const MAX_PROMPT_NAME_LENGTH = 80;

/** Tasks — name ≤ 80, prompt ≤ 6000, interval ≥ 60s. */
export const MAX_TASK_NAME_LENGTH = 80;
export const MAX_TASK_PROMPT_LENGTH = 6000;
export const MIN_TASK_INTERVAL_MS = 60_000;

/** Providers — name ≤ 80. */
export const MAX_PROVIDER_NAME_LENGTH = 80;

/** MCP Connections — name ≤ 80, URL ≤ 2048. */
export const MAX_MCP_CONNECTIONS_PER_AGENT = 10;
export const MAX_MCP_CONNECTION_NAME_LENGTH = 80;
export const MAX_MCP_CONNECTION_URL_LENGTH = 2048;
export const MAX_MCP_BEARER_TOKEN_LENGTH = 8192;
export const MAX_MCP_OAUTH_CLIENT_ID_LENGTH = 2048;
export const MAX_MCP_OAUTH_CLIENT_SECRET_LENGTH = 8192;
export const MAX_MCP_OAUTH_SCOPE_LENGTH = 2048;
export const MAX_MCP_CONNECTION_TEST_LATENCY_MS = 60_000;
export const MAX_MCP_SERVER_NAME_LENGTH = 200;
export const MAX_MCP_SERVER_VERSION_LENGTH = 100;
export const MAX_MCP_TOOL_NAME_LENGTH = 256;
export const MAX_MCP_TOOLS_PER_CONNECTION = 128;
export const MAX_MCP_ATTACHMENT_METADATA_KEYS = 32;
export const MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH = 64;

/** Agents — name ≤ 80, instructions ≤ 3000. */
export const MAX_AGENT_NAME_LENGTH = 80;
export const DEFAULT_AGENTS_LIST_LIMIT = 50;
export const MAX_AGENTS_LIST_LIMIT = 100;
export const MAX_AGENT_INSTRUCTIONS_LENGTH = 3000;

/** Artifacts — 10 MiB per file. */
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

/** Memories — 10 KiB of text per memory. */
export const MAX_MEMORY_TEXT_BYTES = 10 * 1024;

/**
 * Usage — range cap 31 days, default 30 days; top-N sessions default 50, max 200.
 */
export const MAX_USAGE_RANGE_DAYS = 31;
export const DEFAULT_USAGE_RANGE_DAYS = 30;
export const DEFAULT_USAGE_SESSION_TOP_N = 50;
export const MAX_USAGE_SESSION_TOP_N = 200;
export const DEFAULT_USAGE_OVERVIEW_TOP_N = 5;
export const MAX_USAGE_OVERVIEW_TOP_N = 20;

// Quota — reset day between 1 and 28.
export const MIN_QUOTA_RESET_DAY = 1;
export const MAX_QUOTA_RESET_DAY = 28;

/**
 * Tenant (workspace) — display name ≤ 80, set via `PATCH /v1/tenant`.
 */
export const MAX_TENANT_NAME_LENGTH = 80;

/**
 * Merchant monetization (ADR-0048) — guard rule bounds and the delivery-health
 * summary window.
 */
export const MAX_MERCHANT_PRODUCT_IDS = 100;
export const DEFAULT_MERCHANT_USAGE_SUMMARY_DAYS = 14;
export const MAX_MERCHANT_USAGE_SUMMARY_DAYS = 90;
