import { describe, expect, expectTypeOf, it } from "vitest";
import type { KnownBlazingAgentsErrorCode } from "../types.ts";
import { receivedApiErrorResponseSchema } from "./api.ts";
import {
  agentsListQuerySchema,
  agentsResponseSchema,
} from "./entities/agents.ts";

describe("known error codes", () => {
  it("names every code the client can raise", () => {
    const codes = [
      "invalid_request",
      "idempotency_conflict",
      "session_fork_deleted",
      "session_fork_unavailable",
      "input_idempotency_conflict",
      "steer_not_available",
      "validation_failed",
      "unauthorized",
      "forbidden",
      "insufficient_scope",
      "not_found",
      "quota_exceeded",
      "model_spending_limit_exceeded",
      "subscription_required",
      "usage_credit_required",
      "rate_limited",
      "internal",
      "service_unavailable",
      "subscription_already_paid",
      "subscription_not_cancelled",
      "agent_disabled",
      "agent_busy",
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
      "session_turn_unresponsive",
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
      "merchant_connection_in_use",
      "merchant_credential_invalid",
      "merchant_provider_unavailable",
      "merchant_customer_not_found",
      "merchant_binding_not_found",
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
    ] as const;
    expectTypeOf<KnownBlazingAgentsErrorCode>().toEqualTypeOf<
      | (typeof codes)[number]
      | "credential_echo"
      | "invalid_response"
      | "network_error"
      | "request_aborted"
      | "stream_error"
    >();
  });
});

describe("receivedApiErrorResponseSchema", () => {
  it("accepts a future code and additional fields without losing known data", () => {
    expect(
      receivedApiErrorResponseSchema.parse({
        error: {
          code: "future_outcome",
          details: { recovery: "refresh" },
          futureField: true,
          message: "A newer server outcome.",
          param: "/version",
        },
        futureEnvelopeField: "kept",
      })
    ).toStrictEqual({
      error: {
        code: "future_outcome",
        details: { recovery: "refresh" },
        futureField: true,
        message: "A newer server outcome.",
        param: "/version",
      },
      futureEnvelopeField: "kept",
    });
  });

  it("rejects missing or empty required fields", () => {
    expect(
      receivedApiErrorResponseSchema.safeParse({
        error: { code: "", message: "Missing code." },
      }).success
    ).toBe(false);
    expect(
      receivedApiErrorResponseSchema.safeParse({
        error: { code: "future_outcome", message: "" },
      }).success
    ).toBe(false);
    expect(
      receivedApiErrorResponseSchema.safeParse({
        error: { code: "future_outcome" },
      }).success
    ).toBe(false);
  });
});

describe("list cursors", () => {
  it("accepts a non-empty trimmed cursor", () => {
    expect(agentsListQuerySchema.parse({ cursor: "  abc  " }).cursor).toBe(
      "abc"
    );
  });

  it("rejects an empty or whitespace cursor", () => {
    expect(agentsListQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
    expect(agentsListQuerySchema.safeParse({ cursor: "   " }).success).toBe(
      false
    );
  });
});

describe("paginated list envelopes", () => {
  it("accepts an empty page with or without a next cursor", () => {
    expect(
      agentsResponseSchema.parse({ data: [], nextCursor: "next" })
    ).toStrictEqual({
      data: [],
      nextCursor: "next",
    });
    expect(
      agentsResponseSchema.parse({ data: [], nextCursor: null })
    ).toStrictEqual({
      data: [],
      nextCursor: null,
    });
  });

  it("strips extra fields and requires the cursor field", () => {
    expect(
      agentsResponseSchema.parse({ data: [], nextCursor: null, extra: true })
    ).not.toHaveProperty("extra");
    expect(agentsResponseSchema.safeParse({ data: [] }).success).toBe(false);
  });
});
