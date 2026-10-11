import { z } from "zod";

/**
 * `/v1` error envelope — see docs/adr/0003-ai-sdk-native-wire-protocol.md.
 * Closed producer code set; `code` is what SDKs switch on and `message` is
 * human-only. Resource-specific codes preserve stable product outcomes that
 * callers need to distinguish.
 */
export const apiErrorCodeSchema = z.enum([
  "invalid_request",
  "idempotency_conflict",
  "session_fork_deleted",
  "session_fork_unavailable",
  "input_idempotency_conflict",
  "steer_not_available",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "quota_exceeded",
  "model_spending_limit_exceeded",
  "subscription_required",
  "usage_credit_required",
  "rate_limited",
  "internal",
  "service_unavailable",
  "checkout_evidence_mismatch",
  "agent_disabled",
  "admin_agent_managed",
  "agent_mcp_connection_not_found",
  "agent_mcp_connections_invalid",
  "provider_required",
  "api_key_limit_reached",
  "artifact_session_cap_reached",
  "invalid_cursor",
  "message_not_found",
  "message_id_conflict",
  "prompt_variable_missing",
  "prompt_variable_unknown",
  "provider_in_use",
  "provider_historical_use",
  "provider_limit_reached",
  "provider_name_conflict",
  "provider_not_found",
  "model_discovery_unsupported",
  "model_not_found",
  "model_validation_unavailable",
  "mcp_connection_limit_reached",
  "mcp_connection_name_conflict",
  "mcp_connection_stale_credential_version",
  "mcp_connection_invalid",
  "mcp_connection_authentication_failed",
  "mcp_connection_in_use",
  "mcp_connection_unreachable",
  "mcp_connection_discovery_failed",
  "workspace_not_found",
  "workspace_in_use",
  "workspace_busy",
  "session_busy",
  "session_version_mismatch",
  "tool_approval_continuation_settled",
  "tool_approval_decision_conflict",
  "function_call_conflict",
  "skill_invalid_archive",
  "skill_invalid_markdown",
  "skill_limit_reached",
  "skill_name_conflict",
  "skill_not_found",
  "skill_too_many_files",
  "skill_uncompressed_too_large",
  "task_active_run_exists",
  "chat_webhook_conflict",
  "chat_webhook_registration_failed",
  "merchant_connection_not_found",
  "merchant_credential_invalid",
  "merchant_provider_unavailable",
  "merchant_customer_not_found",
  "merchant_binding_not_found",
  "merchant_binding_required",
  "merchant_account_mismatch",
  "merchant_event_not_found",
  "merchant_event_state_conflict",
  "merchant_customer_unmapped",
  "merchant_subscription_required",
  "merchant_balance_required",
  "merchant_eligibility_unavailable",
  "tenant_deleting",
  "tenant_deletion_in_progress",
  "tenant_deletion_not_ready",
  "tenant_not_deleting",
]);

const receivedApiErrorCodeSchema = z.string().min(1);

const receivedApiErrorSchema = z
  .object({
    code: receivedApiErrorCodeSchema,
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string().min(1),
    param: z.string().optional(),
  })
  .passthrough();

export const receivedApiErrorResponseSchema = z
  .object({
    error: receivedApiErrorSchema,
  })
  .passthrough();

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const cursorSchema = z.string().trim().min(1);

/**
 * Creates a schema for a data page and nullable next cursor.
 * @param itemSchema - Item Schema.
 */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      data: z.array(itemSchema),
      nextCursor: z.string().nullable(),
    })
    .strip();
}
