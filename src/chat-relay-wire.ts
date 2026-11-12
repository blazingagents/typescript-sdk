/**
 * The browser-to-relay wire: one POST endpoint whose JSON body names its
 * `op`. `relay.ts` parses requests with these schemas and builds responses
 * that satisfy them; `chat-transport.ts` builds requests from the same types
 * and parses the responses. No public entry exports this module.
 */
import { z } from "zod";
import {
  sessionInputRequestIdSchema,
  sessionInputStateSchema,
} from "./contracts/entities/session-inputs.ts";
import { sessionIdSchema } from "./contracts/ids.ts";

/** The relay asks the API for this many messages per history page, the API's maximum. */
export const RELAY_HISTORY_PAGE_SIZE = 200;

const chatRequestSchema = z.object({
  op: z.literal("chat"),
  /** The last user message, or the last assistant message holding a complete approval-response round. */
  message: z.unknown(),
  messageId: z.string().min(1).optional(),
  sessionId: sessionIdSchema.optional(),
  trigger: z
    .enum(["submit-message", "regenerate-message"])
    .default("submit-message"),
});

const historyRequestSchema = z.object({
  op: z.literal("history"),
  sessionId: sessionIdSchema,
  /** `nextCursor` from the previous page; absent for the newest page. */
  cursor: z.string().min(1).optional(),
});

const steerRequestSchema = z.object({
  op: z.literal("steer"),
  sessionId: sessionIdSchema,
  /** Idempotency key: the same requestId and message replay the receipt. */
  requestId: sessionInputRequestIdSchema,
  message: z.unknown(),
});

/**
 * Inbound relay body. Unknown keys are stripped, so an app's own `body`
 * extras, read by its `resolveContext`, never reach the API.
 */
export const relayRequestSchema = z.discriminatedUnion("op", [
  chatRequestSchema,
  historyRequestSchema,
  steerRequestSchema,
]);
export type RelayRequest = z.output<typeof relayRequestSchema>;

/**
 * `history` 200 body: one API page, newest page first and chronological
 * within it. The relay passes stored messages through unvalidated; the
 * browser validates them.
 */
export const relayHistoryPageSchema = z
  .object({
    data: z.array(z.unknown()),
    nextCursor: z.string().min(1).nullable(),
  })
  .strip();

/** `steer` 202 body: the receipt's state when the relay answered. */
export const relaySteerReceiptSchema = z
  .object({ state: sessionInputStateSchema })
  .strip();
