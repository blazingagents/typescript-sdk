import { z } from "zod";
import { agentIdSchema, sessionIdSchema } from "../ids.ts";
import {
  DEFAULT_USAGE_OVERVIEW_TOP_N,
  DEFAULT_USAGE_RANGE_DAYS,
  MAX_USAGE_OVERVIEW_TOP_N,
  MAX_USAGE_RANGE_DAYS,
} from "../limitations.ts";
import { hasUniqueValues } from "../utils.ts";
import { userIdSchema } from "./attribution.ts";

/**
 * Adds a validation issue when the usage date range is invalid.
 */
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

const usageRangeFields = {
  from: z.iso
    .date()
    .optional()
    .describe(
      "First UTC day to include, as `YYYY-MM-DD`. Send it with `to`, or leave both out for the last 30 days ending today."
    ),
  to: z.iso
    .date()
    .optional()
    .describe(
      `Last UTC day to include, as \`YYYY-MM-DD\`. It must not be before \`from\` and can be at most ${MAX_USAGE_RANGE_DAYS} days after it.`
    ),
};

/**
 * Query for the bounded dashboard-oriented usage overview. The date range has
 * the same semantics as `UsageQuery`; `limit` bounds each ranking.
 */

export const usageOverviewQuerySchema = z
  .object({
    ...usageRangeFields,
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_USAGE_OVERVIEW_TOP_N)
      .default(DEFAULT_USAGE_OVERVIEW_TOP_N)
      .describe(
        `Rows to return in each ranked breakdown (\`byAgent\`, \`byUser\`, \`byModel\`), from 1 to ${MAX_USAGE_OVERVIEW_TOP_N}.`
      ),
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

export const sessionUsageQuerySchema = z
  .object({
    sessionIds: z
      .array(sessionIdSchema)
      .min(1)
      .max(100)
      .refine(hasUniqueValues, {
        message: "Session ids must be unique.",
      })
      .describe(
        "One to 100 distinct session IDs. Every session must be visible to the caller."
      ),
    ...usageRangeFields,
  })
  .strict()
  .superRefine(validateUsageRange);

export const sessionUsageResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            sessionId: sessionIdSchema,
            totals: usageTotalsSchema,
          })
          .strip()
      )
      .min(1)
      .max(100),
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

/**
 * Applies the request-dependent ranking and daily-series guarantees.
 * @param query - Ranking limit and date range used to validate the response.
 */
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
/**
 * `?from=&to=&agentId=&sessionId=&userId=&groupBy=&limit=` for `GET /v1/usage`.
 * `from`/`to` are `YYYY-MM-DD` dates, both present or both absent and at most
 * 31 days apart; the default is the last 30 days ending today (UTC). `groupBy`
 * defaults to `day`; `session` is top-N by tokens, bounded by `limit` (default
 * 50, at most 200), and `user` is the end-user attribution dimension
 * (ADR-0001) with `''` emitted verbatim as the tenant-level bucket. The
 * `sessionId` filter accepts `''` to drill into stateless `completion`/`object`
 * turns; `userId` accepts any opaque string, including `''` for tenant-level
 * usage only. The server enforces these rules; the SDK passes the query through.
 */
export interface UsageQuery {
  agentId?: string;
  from?: string;
  groupBy?: "day" | "agent" | "model" | "session" | "user";
  limit?: number;
  sessionId?: string;
  to?: string;
  userId?: string;
}
export type UsageBucket = z.infer<typeof usageBucketSchema>;
export type UsageTotals = z.infer<typeof usageTotalsSchema>;
export type UsageResponse = z.infer<typeof usageResponseSchema>;
export type UsageOverviewQuery = z.infer<typeof usageOverviewQuerySchema>;
export type UsageOverviewResponse = z.infer<typeof usageOverviewResponseSchema>;
export type SessionUsageQuery = z.infer<typeof sessionUsageQuerySchema>;
export type SessionUsageResponse = z.infer<typeof sessionUsageResponseSchema>;
