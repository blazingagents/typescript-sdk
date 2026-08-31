import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiError,
  apiErrorCodeSchema,
  apiErrorIssueSchema,
  apiErrorResponseSchema,
  apiErrorSchema,
  CursorDecodeError,
  clientRequestCorrelationSchema,
  cursorSchema,
  decodeCursor,
  encodeCursor,
  paginatedResponse,
  paginatedResponseSchema,
  receivedApiErrorResponseSchema,
} from "./api.ts";

const URL_SAFE_CHARS = /[-_]/;
const STANDARD_BASE64_CHARS = /[+/=]/;

describe("clientRequestCorrelationSchema", () => {
  it.each([
    "",
    "a".repeat(129),
    "bad value",
    "bad,delimiter",
    "bad\rvalue",
    "unicode-☃",
  ])("rejects invalid client request correlation %j", (id) => {
    expect(clientRequestCorrelationSchema.safeParse(id).success).toBe(false);
  });

  it("accepts the documented client request correlation alphabet", () => {
    expect(
      clientRequestCorrelationSchema.safeParse("Tenant.attempt_1:retry-2")
        .success
    ).toBe(true);
  });
});

describe("apiErrorIssueSchema", () => {
  it("accepts the normalized public validation issue shape", () => {
    expect(
      apiErrorIssueSchema.parse({
        code: "invalid_type",
        location: "body",
        message: "Expected an object.",
        path: "/output/schema",
      })
    ).toStrictEqual({
      code: "invalid_type",
      location: "body",
      message: "Expected an object.",
      path: "/output/schema",
    });
  });
});

describe("apiErrorCodeSchema", () => {
  it("defines the closed public error-code contract", () => {
    const codes = [
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
    ] as const;
    expect(apiErrorCodeSchema.options).toStrictEqual(codes);
    for (const code of codes) {
      expect(apiErrorCodeSchema.parse(code)).toBe(code);
    }
  });

  it("rejects unknown codes", () => {
    expect(apiErrorCodeSchema.safeParse("forbidden").success).toBe(false);
    expect(apiErrorCodeSchema.safeParse("").success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("accepts a code + message envelope", () => {
    expect(
      apiErrorSchema.parse({
        code: "invalid_request",
        message: "Bad input.",
      })
    ).toStrictEqual({ code: "invalid_request", message: "Bad input." });
  });

  it("rejects extra fields and missing fields", () => {
    expect(
      apiErrorSchema.safeParse({
        code: "invalid_request",
        message: "Bad input.",
        extra: true,
      }).success
    ).toBe(false);
    expect(apiErrorSchema.safeParse({ code: "invalid_request" }).success).toBe(
      false
    );
  });

  it("rejects the retired meta field", () => {
    expect(
      apiErrorSchema.safeParse({
        code: "invalid_request",
        message: "Bad input.",
        meta: { agentIds: ["ag_0123456789abcdef"] },
      }).success
    ).toBe(false);
  });

  it("accepts optional param and details fields", () => {
    expect(
      apiErrorSchema.parse({
        code: "invalid_request",
        details: { agentIds: ["ag_0123456789abcdef"] },
        message: "In use.",
        param: "/providerId",
      })
    ).toStrictEqual({
      code: "invalid_request",
      details: { agentIds: ["ag_0123456789abcdef"] },
      message: "In use.",
      param: "/providerId",
    });
  });

  it("rejects empty details", () => {
    expect(
      apiErrorSchema.safeParse({
        code: "invalid_request",
        details: {},
        message: "Bad input.",
      }).success
    ).toBe(false);
  });
});

describe("apiErrorResponseSchema", () => {
  it("wraps the error under `error`", () => {
    expect(
      apiErrorResponseSchema.parse({
        error: { code: "not_found", message: "Missing." },
      })
    ).toStrictEqual({
      error: { code: "not_found", message: "Missing." },
    });
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

describe("apiError", () => {
  it("builds an envelope literal", () => {
    expect(apiError("unauthorized", "No.")).toStrictEqual({
      error: { code: "unauthorized", message: "No." },
    });
  });

  it("builds an envelope literal with param and details", () => {
    expect(
      apiError("invalid_request", "In use.", {
        details: { agentIds: ["ag_x"] },
        param: "/providerId",
      })
    ).toStrictEqual({
      error: {
        code: "invalid_request",
        details: { agentIds: ["ag_x"] },
        message: "In use.",
        param: "/providerId",
      },
    });
  });

  it("omits empty optional context", () => {
    expect(
      apiError("invalid_request", "Bad input.", { details: {} })
    ).toStrictEqual({
      error: { code: "invalid_request", message: "Bad input." },
    });
  });
});

describe("cursorSchema", () => {
  it("accepts a non-empty trimmed string", () => {
    expect(cursorSchema.parse("  abc  ")).toBe("abc");
  });

  it("rejects empty/whitespace", () => {
    expect(cursorSchema.safeParse("").success).toBe(false);
    expect(cursorSchema.safeParse("   ").success).toBe(false);
  });
});

describe("paginatedResponse", () => {
  it("builds a { data, nextCursor } literal", () => {
    expect(paginatedResponse([1, 2], "next")).toStrictEqual({
      data: [1, 2],
      nextCursor: "next",
    });
    expect(paginatedResponse([], null)).toStrictEqual({
      data: [],
      nextCursor: null,
    });
  });
});

describe("paginatedResponseSchema", () => {
  const itemSchema = z.object({ id: z.string() });
  const schema = paginatedResponseSchema(itemSchema);

  it("accepts a populated list with a cursor", () => {
    expect(
      schema.parse({
        data: [{ id: "a" }, { id: "b" }],
        nextCursor: "next",
      })
    ).toStrictEqual({
      data: [{ id: "a" }, { id: "b" }],
      nextCursor: "next",
    });
  });

  it("accepts an empty list with a null cursor", () => {
    expect(schema.parse({ data: [], nextCursor: null })).toStrictEqual({
      data: [],
      nextCursor: null,
    });
  });

  it("rejects extra fields and missing cursor", () => {
    expect(
      schema.safeParse({
        data: [],
        nextCursor: null,
        extra: true,
      }).success
    ).toBe(false);
    expect(schema.safeParse({ data: [] }).success).toBe(false);
  });
});

describe("encodeCursor / decodeCursor", () => {
  it("round-trips an arbitrary JSON object", () => {
    const payload = { id: "ss_abc", updatedAt: "2026-07-04T00:00:00Z" };
    const encoded = encodeCursor(payload);
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toBe("");
    expect(decodeCursor(encoded)).toStrictEqual(payload);
  });

  it("round-trips numeric fields", () => {
    const payload = { seq: 42 };
    expect(decodeCursor(encodeCursor(payload))).toStrictEqual(payload);
  });

  it("produces URL-safe base64 (no +, /, or =)", () => {
    /**
     * A payload whose JSON contains bytes that map to +, /, and padding
     * in standard base64 — e.g. 0xfb, 0xff, 0x3f.
     */
    const payload = { id: "\u00fb\u00ff?" };
    const encoded = encodeCursor(payload);
    expect(encoded).not.toMatch(STANDARD_BASE64_CHARS);
  });

  it("accepts URL-safe base64 with - and _ on decode", () => {
    const payload = { id: "\u00fb\u00ff?" };
    const encoded = encodeCursor(payload);
    // The encoded form uses - and _ (URL-safe); decode must handle them.
    expect(encoded).toMatch(URL_SAFE_CHARS);
    expect(decodeCursor(encoded)).toStrictEqual(payload);
  });
});

describe("decodeCursor error cases", () => {
  it("throws CursorDecodeError for non-base64 input", () => {
    expect(() => decodeCursor("!!!not-base64!!!")).toThrow(CursorDecodeError);
  });

  it("throws CursorDecodeError for valid base64 of non-JSON", () => {
    // btoa("not json") = "bm90IGpzb24"
    expect(() => decodeCursor("bm90IGpzb24")).toThrow(CursorDecodeError);
  });

  it("throws CursorDecodeError when the payload is not an object", () => {
    /**
     * encodeCursor always produces an object, but a hand-crafted cursor
     * could encode a primitive — decode must reject it.
     */
    const json = JSON.stringify("a string");
    const encoded = btoa(json);
    expect(() => decodeCursor(encoded)).toThrow(CursorDecodeError);
  });

  it("throws CursorDecodeError when the payload is null", () => {
    const json = JSON.stringify(null);
    const encoded = btoa(json);
    expect(() => decodeCursor(encoded)).toThrow(CursorDecodeError);
  });

  it("throws CursorDecodeError when the payload is an array", () => {
    const json = JSON.stringify([1, 2, 3]);
    const encoded = btoa(json);
    expect(() => decodeCursor(encoded)).toThrow(CursorDecodeError);
  });

  it("CursorDecodeError is an Error subclass with the right name", () => {
    try {
      decodeCursor("!!!");
    } catch (error) {
      expect(error).toBeInstanceOf(CursorDecodeError);
      expect(error).toBeInstanceOf(Error);
      expect((error as CursorDecodeError).name).toBe("CursorDecodeError");
      expect((error as CursorDecodeError).message).toBe("Invalid cursor");
    }
  });
});
