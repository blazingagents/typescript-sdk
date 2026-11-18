import { z } from "zod";
import type { BlazingAgentsErrorCode } from "../types.ts";
import { apiErrorCodes } from "./api-error-codes.ts";

/**
 * `/v1` error envelope — see docs/adr/0003-ai-sdk-native-wire-protocol.md.
 * Closed producer code set; `code` is what SDKs switch on and `message` is
 * human-only. Resource-specific codes preserve stable product outcomes that
 * callers need to distinguish.
 */
export const apiErrorCodeSchema = z.enum(apiErrorCodes);

/**
 * A code as received: any non-empty string, so a server newer than this SDK
 * can send a code the SDK does not list. The type keeps autocomplete for the
 * listed codes.
 */
export const receivedApiErrorCodeSchema: z.ZodType<BlazingAgentsErrorCode> = z
  .string()
  .min(1);

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
