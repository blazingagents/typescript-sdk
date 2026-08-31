import { z } from "zod";
import { agentIdSchema, sessionIdSchema } from "../ids.ts";
import {
  DEFAULT_USAGE_SESSION_TOP_N,
  MAX_USAGE_RANGE_DAYS,
  MAX_USAGE_SESSION_TOP_N,
} from "../limitations.ts";
import { userIdSchema } from "./attribution.ts";

/**
 * `GET /v1/usage` groupBy — `day|agent|model|session|user`. `session` is
 * top-N by tokens; the others are exhaustive and bounded. `user` is the
 * end-user attribution dimension (ADR-0001) — one bucket per `userId`, with
 * `''` emitted verbatim as the tenant-level bucket.
 */
export const usageGroupBySchema = z
  .enum(["day", "agent", "model", "session", "user"])
  .default("day");

/**
 * A `sessionId` filter value — either a real platform session id (`ss_…`)
 * or the `''` sentinel for stateless `completion`/`object` turns. The daily
 * table stores `''` for stateless turns; the bucket wire shape maps `''`
 * back to `null` on read (see `usageBucketSchema.sessionId`).
 */
export const usageSessionFilterSchema = z
  .string()
  .refine((v) => v === "" || z.validate(sessionIdSchema, v), {
    message: "Must be a session id or '' for stateless turns.",
  });

/**
 * `?from=&to=&agentId=&sessionId=&userId=&groupBy=&limit=` — `from`/`to` are
 * date strings (`YYYY-MM-DD`) since the daily table is keyed by `day date`.
 * Range capped at 31 days; default is the last 30 days ending today (UTC).
 * The `sessionId` filter accepts `''` to drill into stateless turns only.
 * The `userId` filter accepts any opaque string (including `''` for
 * tenant-level usage only) — see ADR-0001 for the three filter modes.
 */
export const usageQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    agentId: agentIdSchema.optional(),
    sessionId: usageSessionFilterSchema.optional(),
    userId: userIdSchema.optional(),
    groupBy: usageGroupBySchema,
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_USAGE_SESSION_TOP_N)
      .default(DEFAULT_USAGE_SESSION_TOP_N),
  })
  .strict()
  .superRefine((value, ctx) => {
    /**
     * Require either both `from` and `to` or neither — a partial range
     * (only one bound) is rejected so the caller doesn't silently get the
     * default window when they meant to specify a custom range.
     */
    if ((value.from === undefined) !== (value.to === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "`from` and `to` must both be present or both be absent.",
        path: value.from === undefined ? ["from"] : ["to"],
      });
    }
    if (value.from && value.to) {
      const fromMs = new Date(`${value.from}T00:00:00Z`).getTime();
      const toMs = new Date(`${value.to}T00:00:00Z`).getTime();
      const spanDays = (toMs - fromMs) / (1000 * 60 * 60 * 24);
      if (spanDays > MAX_USAGE_RANGE_DAYS) {
        ctx.addIssue({
          code: "custom",
          message: `Usage range must be at most ${MAX_USAGE_RANGE_DAYS} days.`,
          path: ["to"],
        });
      }
      if (toMs < fromMs) {
        ctx.addIssue({
          code: "custom",
          message: "`to` must be after `from`.",
          path: ["to"],
        });
      }
    }
  });

/**
 * Usage bucket — one row per group. `sessionId` is the platform session id
 * (`ss_…`) or `null` for the `''` stateless sentinel (mapped at the read
 * seam); `day` is `YYYY-MM-DD` for `groupBy=day`, else `null`. `userId` is
 * the end-user attribution dimension for `groupBy=user` (else `null`); the
 * `''` tenant-level sentinel is emitted verbatim, not mapped to `null`, so
 * callers can distinguish tenant-level usage from a named user.
 */
export const usageBucketSchema = z
  .object({
    day: z.string().nullable(),
    agentId: agentIdSchema.nullable(),
    sessionId: sessionIdSchema.nullable(),
    userId: userIdSchema.nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const usageTotalsSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const usageResponseSchema = z
  .object({
    buckets: z.array(usageBucketSchema),
    totals: usageTotalsSchema,
  })
  .strict();

export type UsageGroupBy = z.infer<typeof usageGroupBySchema>;
export type UsageQuery = z.infer<typeof usageQuerySchema>;
export type UsageBucket = z.infer<typeof usageBucketSchema>;
export type UsageTotals = z.infer<typeof usageTotalsSchema>;
export type UsageResponse = z.infer<typeof usageResponseSchema>;
