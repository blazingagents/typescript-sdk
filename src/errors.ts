import type { BlazingAgentsErrorCode } from "./types.ts";

/**
 * The SDK's single error class. Server codes remain open for forward
 * compatibility; SDK-local codes distinguish transport, response, abort, and
 * streaming failures.
 *
 * `isInstance` uses the AI SDK's `Symbol.for` marker pattern so it
 * survives duplicated package copies across realms/bundlers.
 */

const BLAZING_AGENTS_ERROR_NAME = "BlazingAgentsError";
const BLAZING_AGENTS_ERROR_MARKER = "blazing-agents.error.BlazingAgentsError";
const BLAZING_AGENTS_ERROR_SYMBOL = Symbol.for(BLAZING_AGENTS_ERROR_MARKER);

export class BlazingAgentsError extends Error {
  declare readonly cause?: unknown;
  readonly code: BlazingAgentsErrorCode;
  readonly details?: Record<string, unknown>;
  readonly headers?: Headers;
  readonly param?: string;
  readonly requestId?: string;
  readonly responseBody?: string;
  readonly responseBodyTruncated?: boolean;
  readonly status?: number;
  // Stryker disable BooleanLiteral: cross-realm identity depends on marker presence, not its value.
  /**
   * Marker property used by `isInstance` for cross-realm `instanceof`
   * checks — the symbol is checked via `in`, not direct property access,
   * so the linter can't see the read.
   * biome-ignore lint/correctness/noUnusedPrivateClassMembers: marker pattern
   */
  private readonly [BLAZING_AGENTS_ERROR_SYMBOL] = true;
  // Stryker restore BooleanLiteral

  constructor(
    {
      code,
      details,
      headers,
      message,
      param,
      requestId,
      responseBody,
      responseBodyTruncated,
      status,
    }: {
      code: BlazingAgentsErrorCode;
      details?: Record<string, unknown>;
      headers?: Headers;
      message: string;
      param?: string;
      requestId?: string;
      responseBody?: string;
      responseBodyTruncated?: boolean;
      status?: number;
    },
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = BLAZING_AGENTS_ERROR_NAME;
    this.code = code;
    this.details = details;
    this.headers = headers;
    this.param = param;
    this.requestId = requestId;
    this.responseBody = responseBody;
    this.responseBodyTruncated = responseBodyTruncated;
    this.status = status;
  }

  static isInstance(error: unknown): error is BlazingAgentsError {
    if (error === null || typeof error !== "object") {
      return false;
    }
    return BLAZING_AGENTS_ERROR_SYMBOL in (error as Record<string, unknown>);
  }
}
