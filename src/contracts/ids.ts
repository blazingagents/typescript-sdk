import { customAlphabet } from "nanoid";
import { z } from "zod";

/**
 * Base62 — the alphabet every platform id body uses (16 chars for ids,
 * 40 chars for API key bodies). Matches the regex check constraints in every
 * migration: `^<prefix>_[0-9A-Za-z]{16}$`.
 */
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const ADMIN_AGENT_ID_PREFIX = "ag_adm";

const createNanoId16 = customAlphabet(BASE62, 16);
const createNanoId13 = customAlphabet(BASE62, 13);
const createAgentIdFirstChar = customAlphabet(BASE62.replace("a", ""), 1);
const createNanoId15 = customAlphabet(BASE62, 15);
const createNanoId40 = customAlphabet(BASE62, 40);

const platformId = (prefix: string) => () => `${prefix}_${createNanoId16()}`;

export const createTenantId = platformId("ten");
export const createAgentId = () =>
  `ag_${createAgentIdFirstChar()}${createNanoId15()}`;
export const mintAdminAgentId = () =>
  `${ADMIN_AGENT_ID_PREFIX}${createNanoId13()}`;
export const createSessionId = platformId("ss");
export const createApiKeyId = platformId("ak");
export const createProviderId = platformId("prv");
export const createMcpConnectionId = platformId("mcp");
export const createWorkspaceId = platformId("ws");
export const createArtifactId = platformId("at");
export const createTaskId = platformId("tk");
export const createTaskRunId = platformId("tr");
export const createMemoryId = platformId("mem");
export const createPromptId = platformId("prompt");
export const createRequestId = platformId("req");
export const createCheckoutAttemptId = platformId("ca");

export const createSkillId = () => `skill_${createNanoId16()}`;

/**
 * API keys — `ba_` + 40 base62 chars (~230 bits entropy). The full token is
 * shown once at creation; only the sha256 hash and a 2-char display fragment
 * are stored. (docs/adr/0004-unified-v1-dual-credential-auth.md)
 */
export const API_KEY_TOKEN_PREFIX = "ba_";

export function createApiKeyToken() {
  return `${API_KEY_TOKEN_PREFIX}${createNanoId40()}`;
}

/**
 * The display fragment is `ba_` + the first 2 chars of the random body —
 * safe to store (~12 of ~230 bits revealed).
 */
export function apiKeyFragmentFromToken(token: string) {
  if (!token.startsWith(API_KEY_TOKEN_PREFIX)) {
    throw new Error(`API key token must start with ${API_KEY_TOKEN_PREFIX}.`);
  }
  const body = token.slice(API_KEY_TOKEN_PREFIX.length);
  return `${API_KEY_TOKEN_PREFIX}${body.slice(0, 2)}`;
}

// Schemas — one per id prefix, mirroring the migration check constraints.
export const tenantIdSchema = z.string().regex(/^ten_[0-9A-Za-z]{16}$/);
export const agentIdSchema = z.string().regex(/^ag_[0-9A-Za-z]{16}$/);
export const isAdminAgentId = (id: string): boolean =>
  id.startsWith(ADMIN_AGENT_ID_PREFIX) && z.validate(agentIdSchema, id);
export const sessionIdSchema = z.string().regex(/^ss_[0-9A-Za-z]{16}$/);
export const apiKeyIdSchema = z.string().regex(/^ak_[0-9A-Za-z]{16}$/);
export const providerIdSchema = z.string().regex(/^prv_[0-9A-Za-z]{16}$/);
export const mcpConnectionIdSchema = z.string().regex(/^mcp_[0-9A-Za-z]{16}$/);
export const workspaceIdSchema = z.string().regex(/^ws_[0-9A-Za-z]{16}$/);
export const artifactIdSchema = z.string().regex(/^at_[0-9A-Za-z]{16}$/);
export const taskIdSchema = z.string().regex(/^tk_[0-9A-Za-z]{16}$/);
export const taskRunIdSchema = z.string().regex(/^tr_[0-9A-Za-z]{16}$/);
export const memoryIdSchema = z.string().regex(/^mem_[0-9A-Za-z]{16}$/);
export const promptIdSchema = z.string().regex(/^prompt_[0-9A-Za-z]{16}$/);
export const requestIdSchema = z.string().regex(/^req_[0-9A-Za-z]{16}$/);
export const checkoutAttemptIdSchema = z.string().regex(/^ca_[0-9A-Za-z]{16}$/);
export const turnIdSchema = z.string().regex(/^turn_[0-9A-Za-z]{16}$/);

export const skillIdSchema = z.string().regex(/^skill_[0-9A-Za-z]{16}$/);

/**
 * API key token + digest helpers. The digest is sha256 hex (64 chars); the
 * fragment is `ba_` + 2 base62 chars. Both stored columns are format-checked
 * in the migration.
 */
export const apiKeyTokenSchema = z.string().regex(/^ba_[0-9A-Za-z]{40}$/);
export const apiKeyDigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const apiKeyFragmentSchema = z.string().regex(/^ba_[0-9A-Za-z]{2}$/);

// Provider key fragment — last 4 chars of the secret, display-only.
export const providerKeyFragmentSchema = z.string().min(1).max(4);

export type TurnId = z.infer<typeof turnIdSchema>;
