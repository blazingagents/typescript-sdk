import { describe, expect, it } from "vitest";
import { BlazingAgentsError } from "./errors.ts";

describe("BlazingAgentsError", () => {
  it("carries the complete HTTP error context", () => {
    const headers = new Headers({
      "retry-after": "30",
      "x-request-id": "request-response",
    });
    const error = new BlazingAgentsError(
      {
        code: "agent_name_conflict",
        details: { conflictingResourceId: "ag_0123456789abcdef" },
        headers,
        message: "An Agent with this name already exists.",
        param: "/name",
        requestId: "request-response",
        responseBody: "diagnostic",
        responseBodyTruncated: true,
        status: 409,
      },
      { cause: "upstream failure" }
    );
    expect(error).toMatchObject({
      cause: "upstream failure",
      code: "agent_name_conflict",
      details: { conflictingResourceId: "ag_0123456789abcdef" },
      headers,
      message: "An Agent with this name already exists.",
      name: "BlazingAgentsError",
      param: "/name",
      requestId: "request-response",
      responseBody: "diagnostic",
      responseBodyTruncated: true,
      status: 409,
    });
  });

  it.each([
    "invalid_response",
    "network_error",
    "request_aborted",
    "stream_error",
  ] as const)("supports the SDK-local %s code", (code) => {
    const error = new BlazingAgentsError({ code, message: "SDK failure" });
    expect(error.code).toBe(code);
    expect(error.status).toBeUndefined();
  });

  it("supports unknown future server codes", () => {
    const error = new BlazingAgentsError({
      code: "future_server_outcome",
      message: "Upgrade when convenient.",
      status: 409,
    });
    expect(error.code).toBe("future_server_outcome");
  });

  it("isInstance returns true for real instances", () => {
    const error = new BlazingAgentsError({
      code: "internal",
      message: "boom",
      status: 500,
    });
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
  });

  it("isInstance returns false for non-errors", () => {
    expect(BlazingAgentsError.isInstance(null)).toBe(false);
    expect(BlazingAgentsError.isInstance(undefined)).toBe(false);
    expect(BlazingAgentsError.isInstance("string")).toBe(false);
    expect(BlazingAgentsError.isInstance(42)).toBe(false);
    expect(BlazingAgentsError.isInstance({})).toBe(false);
  });

  it("isInstance returns false for generic Errors", () => {
    expect(BlazingAgentsError.isInstance(new Error("plain"))).toBe(false);
  });

  it("isInstance survives across realms (Symbol.for marker)", () => {
    /**
     * Simulate a duplicated package copy: a fresh object carrying the
     * same `Symbol.for` marker is recognized as a `BlazingAgentsError`.
     */
    const marker = Symbol.for("blazing-agents.error.BlazingAgentsError");
    const fake = Object.create(BlazingAgentsError.prototype);
    Object.defineProperty(fake, marker, { value: true, writable: true });
    expect(BlazingAgentsError.isInstance(fake)).toBe(true);
  });
});
