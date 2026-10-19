import { z } from "zod";
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
  /**
   * Marker property used by `isInstance` for cross-realm `instanceof`
   * checks — the symbol is checked via `in`, not direct property access,
   * so the linter can't see the read.
   * biome-ignore lint/correctness/noUnusedPrivateClassMembers: marker pattern
   */
  private readonly [BLAZING_AGENTS_ERROR_SYMBOL] = true;

  /**
   * Creates an SDK error with its code, diagnostics, and optional cause.
   * @param options - Configuration for this operation.
   */
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
    super(`[${code}] ${message}`, options);
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

  /**
   * Checks the shared symbol marker, including errors from duplicated SDK packages.
   * @param error - Value to inspect or handle.
   * @returns Whether the value carries the SDK error marker.
   */
  static isInstance(error: unknown): error is BlazingAgentsError {
    if (error === null || typeof error !== "object") {
      return false;
    }
    return BLAZING_AGENTS_ERROR_SYMBOL in (error as Record<string, unknown>);
  }
}

/**
 * Parses caller input the SDK must check before any request, such as a value
 * that becomes a header or transport state.
 * @param schema - Schema the value must satisfy.
 * @param value - Caller-supplied value.
 * @param param - Name of the caller parameter, reported on the error.
 * @returns The parsed value.
 * @throws BlazingAgentsError - With code `invalid_request` if the value is invalid.
 */
export function parseClientInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  param: string
): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BlazingAgentsError(
      {
        code: "invalid_request",
        message: `Invalid ${param}: ${z.prettifyError(parsed.error)}`,
        param,
      },
      { cause: parsed.error }
    );
  }
  return parsed.data;
}
