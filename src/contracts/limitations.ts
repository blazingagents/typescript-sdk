/**
 * Effort-wide convention: every coded limit lives here as an UPPER_SNAKE_CASE
 * constant. No scattered magic numbers.
 */

/**
 * API keys — max 5 per tenant, name ≤ 80 (docs/adr/0004).
 */
export const MAX_API_KEYS_PER_TENANT = 5;
export const MAX_API_KEY_NAME_LENGTH = 80;

/**
 * API key token shape — `ba_` + 40 base62 chars (~230 bits entropy).
 * The prefix and body/fragment lengths live in `ids.ts` alongside the
 * generators and schemas.
 */
export const API_KEY_BODY_LENGTH = 40;
// Display fragment — `ba_` + first 2 chars of the random body.
export const API_KEY_FRAGMENT_BODY_LENGTH = 2;

/** Workspaces. */
export const MAX_WORKSPACE_NAME_LENGTH = 80;
export const MAX_WORKSPACE_ARCHIVE_ENTRIES = 16_384;
export const DEFAULT_WORKSPACES_LIST_LIMIT = 50;
export const MAX_WORKSPACES_LIST_LIMIT = 200;

/**
 * Agent Skills — at most 100 per Agent, 10 MiB per upload/archive and stored
 * namespace, and 100 regular files. Frontmatter follows the Agent Skills
 * specification accepted in ADR-0028.
 */
export const MAX_SKILLS_PER_AGENT = 100;
export const MAX_SKILL_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_SKILL_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
export const MAX_SKILL_FILES = 100;
export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_COMPATIBILITY_LENGTH = 500;
export const MAX_SKILL_COPY_DESTINATIONS = 30;
export const DEFAULT_SKILLS_LIST_LIMIT = 50;
export const MAX_SKILLS_LIST_LIMIT = 100;

/**
 * Prompts — max 100 per tenant, ~10 KB template cap, name ≤ 80.
 */
export const MAX_PROMPTS_PER_TENANT = 100;
export const MAX_PROMPT_TEMPLATE_BYTES = 10 * 1024;
export const MAX_PROMPT_VARIABLES = 10;
export const MAX_PROMPT_NAME_LENGTH = 80;

/** Tasks — name ≤ 80, prompt ≤ 6000, interval ≥ 60s. */
export const MAX_TASK_NAME_LENGTH = 80;
export const MAX_TASK_PROMPT_LENGTH = 6000;
export const MIN_TASK_INTERVAL_MS = 60_000;

/**
 * Providers — max 20 per tenant, name ≤ 80.
 */
export const MAX_PROVIDERS_PER_TENANT = 20;
export const MAX_PROVIDER_NAME_LENGTH = 80;
export const PROVIDER_KEY_FRAGMENT_LENGTH = 4;

/**
 * MCP Connections — max 50 per tenant, name ≤ 80, URL ≤ 2048.
 */
export const MAX_MCP_CONNECTIONS_PER_TENANT = 50;
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
export const MAX_MCP_TOOLS_PER_TURN = 256;
export const MAX_MCP_CONNECTION_SETUP_CONCURRENCY = 4;
export const MAX_MCP_TOOL_KEY_LENGTH = 63;
export const MAX_MCP_TOOL_DEFINITION_BYTES = 256 * 1024;
export const MAX_MCP_CONNECTION_TOOL_DEFINITIONS_BYTES = 1024 * 1024;
export const MAX_MCP_TOOL_RESULT_BYTES = 1024 * 1024;
export const MAX_MCP_ATTACHMENT_METADATA_KEYS = 32;
export const MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH = 64;
export const MAX_MCP_REQUEST_CONTEXT_BYTES = 16 * 1024;

/** Agents — name ≤ 80, instructions ≤ 3000. */
export const MAX_AGENT_NAME_LENGTH = 80;
export const MAX_AGENT_INSTRUCTIONS_LENGTH = 3000;
export const DEFAULT_AGENT_VERSIONS_LIST_LIMIT = 50;
export const MAX_AGENT_VERSIONS_LIST_LIMIT = 200;

/**
 * Artifacts — 10 MiB per file, 10 publications per Tool call, and 100
 * Artifacts per Session.
 */
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const MAX_ARTIFACT_PUBLICATIONS_PER_CALL = 10;
export const MAX_ARTIFACTS_PER_SESSION = 100;

/**
 * Sandbox operations — 30-second native Cloudflare commands under a bounded
 * private HTTP caller budget that includes cold Container startup. File
 * transfers are 10 MiB decoded under a 15 MiB authenticated internal JSON
 * request.
 */
export const CLOUDFLARE_SANDBOX_EXEC_MS = 30_000;
export const MAX_SANDBOX_OPERATION_HTTP_MS = 160_000;
export const MAX_SANDBOX_FILE_TRANSFER_BYTES = 10 * 1024 * 1024;
export const MAX_SANDBOX_FILE_CHUNK_BYTES = 1024 * 1024;
export const MAX_SANDBOX_REQUEST_BODY_BYTES = 15 * 1024 * 1024;

/**
 * Memories — one pool per Agent spanning all `userId` partitions, capped
 * globally at 500 rows (LRU eviction on create), 10 KiB of text per memory
 * (zod byte refine + DB `octet_length` check).
 */
export const MAX_MEMORIES_PER_AGENT = 500;
export const MAX_MEMORY_TEXT_BYTES = 10 * 1024;
export const DEFAULT_MEMORIES_LIST_LIMIT = 50;
export const MAX_MEMORIES_LIST_LIMIT = 100;
export const DEFAULT_MEMORY_TOOL_SEARCH_LIMIT = 10;
export const MAX_MEMORY_TOOL_SEARCH_LIMIT = 20;

/**
 * Sessions — messages endpoint default limit 50, max 200.
 */
export const DEFAULT_SESSION_MESSAGES_LIMIT = 50;
export const MAX_SESSION_MESSAGES_LIMIT = 200;

/**
 * Usage — range cap 31 days, default 30 days; top-N sessions default 50, max 200.
 */
export const MAX_USAGE_RANGE_DAYS = 31;
export const DEFAULT_USAGE_RANGE_DAYS = 30;
export const DEFAULT_USAGE_SESSION_TOP_N = 50;
export const MAX_USAGE_SESSION_TOP_N = 200;

// Quota — reset day between 1 and 28.
export const MIN_QUOTA_RESET_DAY = 1;
export const MAX_QUOTA_RESET_DAY = 28;

/**
 * Tenant (workspace) — display name ≤ 80, set via `PATCH /v1/tenant`.
 */
export const MAX_TENANT_NAME_LENGTH = 80;

/**
 * Tenant resource creation — provisional abuse-protection throughput, applied
 * independently to Agent, Task, and Workspace creation.
 */
export const TENANT_CREATION_BURST_LIMIT = 60;
export const TENANT_CREATION_BURST_WINDOW_MS = 60_000;
export const TENANT_CREATION_SUSTAINED_LIMIT = 1000;
export const TENANT_CREATION_SUSTAINED_WINDOW_MS = 86_400_000;
