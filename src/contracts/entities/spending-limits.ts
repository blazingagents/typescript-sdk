import { z } from "zod";

export const spendingLimitResetIntervalSchema = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
]);
export const spendingLimitSchema = z
  .object({
    amountUsd: z.number().positive().max(1_000_000_000).multipleOf(0.000_001),
    resetStartDate: z.iso.date(),
    resetInterval: spendingLimitResetIntervalSchema,
  })
  .strict()
  .meta({ id: "ModelSpendingLimit" });
export const updateSpendingLimitBodySchema = z
  .object({
    spendingLimit: spendingLimitSchema
      .nullable()
      .describe(
        "Model-only USD allowance and UTC reset schedule. Set null to disable the limit."
      ),
  })
  .strict();
export const spendingLimitPeriodSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    spentUsd: z.number().nonnegative(),
    reservedUsd: z.number().nonnegative(),
    availableUsd: z.number().nonnegative(),
  })
  .strict();
export const spendingLimitResponseSchema = z
  .object({
    spendingLimit: spendingLimitSchema.nullable(),
    period: spendingLimitPeriodSchema.nullable(),
    nextResetAt: z.iso.datetime({ offset: true }).nullable(),
    scheduleChangeAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .meta({ id: "ModelSpendingLimitStatus" });
export const spendingLimitStopDetailsSchema = z
  .object({
    scope: z.enum(["agent", "tenant", "both"]),
    reason: z.enum(["exhausted", "reserved", "unpriced", "unknown_usage"]),
    spentUsd: z.number().nonnegative(),
    reservedUsd: z.number().nonnegative(),
    availableUsd: z.number().nonnegative(),
    nextResetAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type SpendingLimit = z.infer<typeof spendingLimitSchema>;
export type SpendingLimitResponse = z.infer<typeof spendingLimitResponseSchema>;
export type SpendingLimitStopDetails = z.infer<
  typeof spendingLimitStopDetailsSchema
>;
export type UpdateSpendingLimitBody = z.infer<
  typeof updateSpendingLimitBodySchema
>;

export function nextSpendingLimitReset(
  schedule: Pick<SpendingLimit, "resetStartDate" | "resetInterval">,
  after: string | Date
): string {
  const anchor = new Date(`${schedule.resetStartDate}T00:00:00.000Z`);
  const instant = new Date(after).getTime();
  if (anchor.getTime() > instant) {
    return anchor.toISOString();
  }
  if (schedule.resetInterval !== "monthly") {
    const days = { daily: 1, weekly: 7, biweekly: 14 }[schedule.resetInterval];
    const interval = days * 86_400_000;
    return new Date(
      anchor.getTime() +
        (Math.floor((instant - anchor.getTime()) / interval) + 1) * interval
    ).toISOString();
  }
  const current = new Date(instant);
  let month = current.getUTCMonth();
  const year = current.getUTCFullYear();
  const boundary = () =>
    new Date(
      Date.UTC(
        year,
        month,
        Math.min(
          anchor.getUTCDate(),
          new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        )
      )
    );
  if (boundary().getTime() <= instant) {
    month += 1;
  }
  return boundary().toISOString();
}

export const spendingLimitStopEventSchema = z
  .object({
    type: z.literal("data-model-spending-limit"),
    data: spendingLimitStopDetailsSchema.extend({
      code: z.literal("model_spending_limit_exceeded"),
    }),
    transient: z.literal(true),
  })
  .strict();
export type SpendingLimitStopEvent = z.infer<
  typeof spendingLimitStopEventSchema
>;
