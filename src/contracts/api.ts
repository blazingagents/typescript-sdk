import { z } from "zod";

export const clientRequestCorrelationSchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/);

export const apiErrorIssueSchema = z
  .object({
    code: z.string().min(1),
    location: z.enum(["body", "path", "query", "header"]),
    message: z.string().min(1),
    path: z.string(),
  })
  .strict();

export type ApiErrorIssue = z.infer<typeof apiErrorIssueSchema>;

/**
 * `/v1` error envelope — see docs/adr/0003-ai-sdk-native-wire-protocol.md.
 * Closed producer code set; `code` is what SDKs switch on and `message` is
 * human-only. Resource-specific codes preserve stable product outcomes that
 * callers need to distinguish.
 */
export const apiErrorCodeSchema = z.enum([
  "invalid_request",
  "validation_failed",
  "unauthorized",
  "not_found",
  "quota_exceeded",
  "subscription_required",
  "usage_credit_required",
  "rate_limited",
  "internal",
  "service_unavailable",
  "checkout_evidence_mismatch",
  "agent_disabled",
  "admin_agent_managed",
  "agent_version_not_found",
  "agent_mcp_connection_not_found",
  "agent_mcp_connections_invalid",
  "agent_name_conflict",
  "provider_required",
  "api_key_limit_reached",
  "artifact_session_cap_reached",
  "invalid_cursor",
  "message_not_found",
  "prompt_limit_reached",
  "prompt_name_conflict",
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
  "tool_approval_continuation_not_found",
  "tool_approval_decision_conflict",
  "skill_invalid_archive",
  "skill_invalid_markdown",
  "skill_limit_reached",
  "skill_name_conflict",
  "skill_not_found",
  "skill_too_many_files",
  "skill_uncompressed_too_large",
  "task_active_run_exists",
]);

export const apiErrorSchema = z
  .object({
    code: apiErrorCodeSchema,
    details: z
      .record(z.string(), z.unknown())
      .refine((value) => Object.keys(value).length > 0)
      .optional(),
    message: z.string().min(1),
    param: z.string().optional(),
  })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    error: apiErrorSchema,
  })
  .strict();

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
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ReceivedApiErrorCode = z.infer<typeof receivedApiErrorCodeSchema>;

export interface ApiErrorOptions {
  details?: Record<string, unknown>;
  param?: string;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  options: ApiErrorOptions = {}
): ApiErrorResponse {
  return {
    error: {
      code,
      ...(options.details && Object.keys(options.details).length > 0
        ? { details: options.details }
        : {}),
      message,
      ...(options.param === undefined ? {} : { param: options.param }),
    },
  };
}

/**
 * Cursor pagination — `{ data, nextCursor }` on unbounded list surfaces,
 * including sessions, transcripts, artifacts, and memories.
 * `nextCursor` is opaque (base64 of the keyset); `null` means no more pages.
 */
export function paginatedResponse<T>(data: T[], nextCursor: string | null) {
  return { data, nextCursor };
}

export const cursorSchema = z.string().trim().min(1);

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      data: z.array(itemSchema),
      nextCursor: z.string().nullable(),
    })
    .strict();
}

/**
 * Opaque keyset cursor helpers. Cursors are base64url-encoded JSON of the
 * keyset tuple the endpoint paginates by — never a raw value, never a row
 * id alone. The repo-wide pattern: keyset-backed `{ data, nextCursor }`,
 * mapping 1:1 onto `useInfiniteQuery`. Decode failures surface as
 * `INVALID_CURSOR` (the caller wraps the throw).
 */
export class CursorDecodeError extends Error {
  readonly errorCode = "INVALID_CURSOR";
  readonly statusCode = 400;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CursorDecodeError";
  }
}

const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /[=]+$/;
const BASE64_DASH = /-/g;
const BASE64_UNDERSCORE = /_/g;

export function encodeCursor(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(BASE64_PLUS, "-")
    .replace(BASE64_SLASH, "_")
    .replace(BASE64_PADDING, "");
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  let json: string;
  try {
    const binary = atob(
      cursor.replace(BASE64_DASH, "+").replace(BASE64_UNDERSCORE, "/")
    );
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("cursor payload is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    throw new CursorDecodeError("Invalid cursor", { cause });
  }
}
