import { describe, expect, expectTypeOf, it } from "vitest";
import type { KnownBlazingAgentsErrorCode } from "../types.ts";
import { receivedApiErrorResponseSchema } from "./api.ts";
import {
  agentsListQuerySchema,
  agentsResponseSchema,
} from "./entities/agents.ts";
import { providersResponseSchema } from "./entities/providers.ts";

describe("known error codes", () => {
  it("types the contract's codes and the client's own, and no other string", () => {
    expectTypeOf<
      | "tool_approval_outdated"
      | "mcp_connection_discovery_failed"
      | "tenant_deleting"
      | "service_unavailable"
      | "internal"
    >().toExtend<KnownBlazingAgentsErrorCode>();
    expectTypeOf<
      | "credential_echo"
      | "invalid_response"
      | "network_error"
      | "request_aborted"
      | "stream_error"
    >().toExtend<KnownBlazingAgentsErrorCode>();
    expectTypeOf<"future_outcome">().not.toExtend<KnownBlazingAgentsErrorCode>();
    expectTypeOf<"turn_interrupted">().not.toExtend<KnownBlazingAgentsErrorCode>();
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

describe("whole-list envelopes", () => {
  it("carry every record under data and no cursor", () => {
    expect(
      providersResponseSchema.parse({ data: [], nextCursor: "next" })
    ).toStrictEqual({ data: [] });
  });

  it("require data and refuse the removed providers key", () => {
    expect(providersResponseSchema.safeParse({}).success).toBe(false);
    expect(providersResponseSchema.safeParse({ providers: [] }).success).toBe(
      false
    );
  });
});
