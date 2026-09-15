import { z } from "zod";
import { agentIdSchema, sessionIdSchema } from "../ids.ts";
import {
  DEFAULT_USAGE_OVERVIEW_TOP_N,
  DEFAULT_USAGE_RANGE_DAYS,
  DEFAULT_USAGE_SESSION_TOP_N,
  MAX_USAGE_OVERVIEW_TOP_N,
  MAX_USAGE_RANGE_DAYS,
  MAX_USAGE_SESSION_TOP_N,
} from "../limitations.ts";
import { userIdSchema } from "./attribution.ts";

function validateUsageRange(
  value: { from?: string; to?: string },
  ctx: z.RefinementCtx
) {
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
}

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
  .superRefine(validateUsageRange);

/**
 * Query for the bounded dashboard-oriented usage overview. The date range has
 * the same semantics as `usageQuerySchema`; `limit` bounds each ranking.
 */
export const usageOverviewQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_USAGE_OVERVIEW_TOP_N)
      .default(DEFAULT_USAGE_OVERVIEW_TOP_N),
  })
  .strict()
  .superRefine(validateUsageRange);

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
  .strip();

export const usageTotalsSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strip();

export const usageResponseSchema = z
  .object({
    buckets: z.array(usageBucketSchema),
    totals: usageTotalsSchema,
  })
  .strip();

/**
 * Dashboard usage data from one bounded aggregation. `byModel` may contain
 * one final `{ provider: null, model: null }` bucket for usage outside the
 * top-N models.
 */
export const usageOverviewResponseSchema = z
  .object({
    totals: usageTotalsSchema,
    daily: z.array(usageBucketSchema).max(MAX_USAGE_RANGE_DAYS + 1),
    byAgent: z.array(usageBucketSchema).max(MAX_USAGE_OVERVIEW_TOP_N),
    byUser: z.array(usageBucketSchema).max(MAX_USAGE_OVERVIEW_TOP_N),
    byModel: z.array(usageBucketSchema).max(MAX_USAGE_OVERVIEW_TOP_N + 1),
    activeAgentCount: z.number().int().nonnegative(),
  })
  .strip()
  .superRefine((value, ctx) => {
    const remainderCount = value.byModel.filter(
      ({ model, provider }) => model === null && provider === null
    ).length;
    const normalCount = value.byModel.length - remainderCount;
    const hasProviderWithoutModel = value.byModel.some(
      ({ model, provider }) => model === null && provider !== null
    );
    if (
      remainderCount > 1 ||
      normalCount > MAX_USAGE_OVERVIEW_TOP_N ||
      hasProviderWithoutModel
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Model usage must contain at most 20 models and one remainder.",
        path: ["byModel"],
      });
    }
  });

/** Applies the request-dependent ranking and daily-series guarantees. */
export function usageOverviewResponseSchemaForQuery(
  query: Partial<UsageOverviewQuery> = {}
) {
  const limit = query.limit ?? DEFAULT_USAGE_OVERVIEW_TOP_N;
  const expectedDays =
    query.from && query.to
      ? (new Date(`${query.to}T00:00:00Z`).getTime() -
          new Date(`${query.from}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24) +
        1
      : DEFAULT_USAGE_RANGE_DAYS;

  return usageOverviewResponseSchema.superRefine((value, ctx) => {
    const normalModelCount = value.byModel.filter(
      ({ model, provider }) => model !== null || provider !== null
    ).length;
    if (
      value.byAgent.length > limit ||
      value.byUser.length > limit ||
      normalModelCount > limit
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Usage rankings exceed the requested limit.",
        path: ["byAgent"],
      });
    }

    const days = value.daily.map(({ day }) => day);
    const firstDay = query.from ?? days[0];
    const completeDailyRange =
      days.length === expectedDays &&
      firstDay !== null &&
      firstDay !== undefined &&
      days.every((day, index) => {
        const expected = new Date(
          new Date(`${firstDay}T00:00:00Z`).getTime() +
            index * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10);
        return day === expected;
      });
    if (!completeDailyRange) {
      ctx.addIssue({
        code: "custom",
        message: "Daily usage must cover the complete selected range.",
        path: ["daily"],
      });
    }
  });
}

export type UsageGroupBy = z.infer<typeof usageGroupBySchema>;
export type UsageQuery = z.infer<typeof usageQuerySchema>;
export type UsageBucket = z.infer<typeof usageBucketSchema>;
export type UsageTotals = z.infer<typeof usageTotalsSchema>;
export type UsageResponse = z.infer<typeof usageResponseSchema>;
export type UsageOverviewQuery = z.infer<typeof usageOverviewQuerySchema>;
export type UsageOverviewResponse = z.infer<typeof usageOverviewResponseSchema>;
