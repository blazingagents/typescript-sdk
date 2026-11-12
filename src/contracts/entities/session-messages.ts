import { z } from "zod";

/**
 * `GET /v1/agents/{agentId}/sessions/{sessionId}/messages` — transcript as
 * `UIMessage[]` verbatim, paginated backwards (newest page first) with an
 * optional forward `?after={cursor}` for the poll loop.
 */
export const sessionMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["system", "user", "assistant"]),
    branchable: z.boolean(),
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

export type SessionMessage = z.infer<typeof sessionMessageSchema>;
