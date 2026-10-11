import { z } from "zod";

const ADMIN_AGENT_ID_PREFIX = "ag_adm";

// Schemas — one per id prefix, mirroring the migration check constraints.
export const tenantIdSchema = z.string().regex(/^ten_[0-9A-Za-z]{16}$/);
export const agentIdSchema = z.string().regex(/^ag_[0-9A-Za-z]{16}$/);
/**
 * Checks the administrator prefix and validates the complete Agent ID.
 */
export const isAdminAgentId = (id: string): boolean =>
  id.startsWith(ADMIN_AGENT_ID_PREFIX) && z.validate(agentIdSchema, id);
export const sessionIdSchema = z.string().regex(/^ss_[0-9A-Za-z]{16}$/);
export const providerIdSchema = z.string().regex(/^prv_[0-9A-Za-z]{16}$/);
export const mcpConnectionIdSchema = z.string().regex(/^mcp_[0-9A-Za-z]{16}$/);
export const merchantConnectionIdSchema = z
  .string()
  .regex(/^mch_[0-9A-Za-z]{16}$/);
export const merchantUsageEventIdSchema = z
  .string()
  .regex(/^mev_[0-9A-Za-z]{16}$/);
export const workspaceIdSchema = z.string().regex(/^ws_[0-9A-Za-z]{16}$/);
export const artifactIdSchema = z.string().regex(/^at_[0-9A-Za-z]{16}$/);
export const taskIdSchema = z.string().regex(/^tk_[0-9A-Za-z]{16}$/);
export const taskRunIdSchema = z.string().regex(/^tr_[0-9A-Za-z]{16}$/);
export const memoryIdSchema = z.string().regex(/^mem_[0-9A-Za-z]{16}$/);
export const promptIdSchema = z.string().regex(/^prompt_[0-9A-Za-z]{16}$/);
export const turnIdSchema = z.string().regex(/^turn_[0-9A-Za-z]{16}$/);
export const functionCallIdSchema = z.string().regex(/^fc_[0-9A-Za-z]{16}$/);

export const skillIdSchema = z.string().regex(/^skill_[0-9A-Za-z]{16}$/);

/** API keys are `ba_` + 40 base62 characters. */
export const apiKeyTokenSchema = z.string().regex(/^ba_[0-9A-Za-z]{40}$/);

// Provider key fragment — last 4 chars of the secret, display-only.
export const providerKeyFragmentSchema = z.string().min(1).max(4);

export const chatConnectionIdSchema = z.string().regex(/^cc_[0-9A-Za-z]{16}$/);
export const chatDeliveryIdSchema = z.string().regex(/^cd_[0-9A-Za-z]{16}$/);
