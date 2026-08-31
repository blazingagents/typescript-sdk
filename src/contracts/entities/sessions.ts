import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
import { sessionIdSchema } from "../ids.ts";
import {
  DEFAULT_SESSION_MESSAGES_LIMIT,
  MAX_SESSION_MESSAGES_LIMIT,
} from "../limitations.ts";
import { agentVersionNumberSchema } from "./agents.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

/**
 * `GET /v1/agents/{agentId}/sessions` list item — the public wire shape:
 * `{ id, agentVersion, createdAt, updatedAt, messageCount,
 * lastMessagePreview, userId, metadata }`. `agentId`/`tenantId` are internal
 * (used for filtering) and never leak to the wire. `userId`/`metadata` are
 * stamped at lazy materialization (the first successful turn's attribution).
 */
export const sessionListItemSchema = z
  .object({
    agentVersion: agentVersionNumberSchema.nullable(),
    id: sessionIdSchema,
    messageCount: z.number().int().nonnegative(),
    lastMessagePreview: z.string().nullable(),
    userId: userIdSchema,
    metadata: metadataSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const sessionsListResponseSchema = paginatedResponseSchema(
  sessionListItemSchema
);

/**
 * `GET /v1/agents/{agentId}/sessions/{sessionId}/messages` — transcript as
 * `UIMessage[]` verbatim, paginated backwards (newest page first) with an
 * optional forward `?after={cursor}` for the poll loop.
 */
export const sessionMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["system", "user", "assistant"]),
    parts: z
      .array(
        z
          .object({
            type: z.string().min(1),
          })
          .passthrough()
      )
      .min(1),
    metadata: z.unknown().optional(),
  })
  .passthrough();

/**
 * The messages endpoint carries two cursors: `nextCursor` for continuing
 * pagination in the requested direction (backward `?cursor=` walks older
 * pages; forward `?after=` walks the next forward page), and `latestCursor`
 * — the tail position (the seq of the newest message in the page) for the
 * cron/task poll loop to pass back as `?after=`. `latestCursor` is always
 * present when `data` is non-empty, even on the last page, so the poll loop
 * has a cursor to watch a transcript grow.
 */
export const sessionMessagesResponseSchema = z
  .object({
    data: z.array(sessionMessageSchema),
    nextCursor: z.string().nullable(),
    latestCursor: z.string().nullable(),
  })
  .strict();

// Query params for the messages endpoint.
export const sessionMessagesQuerySchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SESSION_MESSAGES_LIMIT)
      .default(DEFAULT_SESSION_MESSAGES_LIMIT),
    cursor: z.string().nullable().optional(),
    after: z.string().nullable().optional(),
  })
  .strict()
  .refine((value) => !(value.cursor && value.after), {
    message: "cursor and after are mutually exclusive.",
    path: ["after"],
  });

/** Decision-only input for one server-owned Tool approval. */
export const decideToolApprovalBodySchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const toolApprovalContinuationStateSchema = z.enum([
  "waiting",
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const toolApprovalStateSchema = z
  .object({
    approvalId: z.string().min(1),
    decision: z.enum(["pending", "approved", "denied"]),
    input: z.json(),
    reason: z.string().nullable(),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
  })
  .strict();

export const toolApprovalContinuationSchema = z
  .object({
    id: z.string().min(1),
    state: toolApprovalContinuationStateSchema,
  })
  .strict();

export const toolApprovalsResponseSchema = z
  .object({
    data: z.array(toolApprovalStateSchema),
    continuation: toolApprovalContinuationSchema.nullable(),
  })
  .strict();

export const toolApprovalDecisionResponseSchema = z
  .object({
    continuationId: z.string().min(1),
    state: toolApprovalContinuationStateSchema,
  })
  .strict();

export type SessionListItem = z.infer<typeof sessionListItemSchema>;
export type SessionsListResponse = z.infer<typeof sessionsListResponseSchema>;
export type SessionMessage = z.infer<typeof sessionMessageSchema>;
export type SessionMessagesResponse = z.infer<
  typeof sessionMessagesResponseSchema
>;
export type SessionMessagesQuery = z.infer<typeof sessionMessagesQuerySchema>;
export type DecideToolApprovalBody = z.infer<
  typeof decideToolApprovalBodySchema
>;
export type ToolApprovalContinuationState = z.infer<
  typeof toolApprovalContinuationStateSchema
>;
export type ToolApprovalState = z.infer<typeof toolApprovalStateSchema>;
export type ToolApprovalsResponse = z.infer<typeof toolApprovalsResponseSchema>;
export type ToolApprovalDecisionResponse = z.infer<
  typeof toolApprovalDecisionResponseSchema
>;
