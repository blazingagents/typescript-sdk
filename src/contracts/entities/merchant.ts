import { z } from "zod";
import {
  agentIdSchema,
  merchantConnectionIdSchema,
  merchantUsageEventIdSchema,
  providerKeyFragmentSchema,
  sessionIdSchema,
  turnIdSchema,
} from "../ids.ts";
import {
  DEFAULT_MERCHANT_USAGE_SUMMARY_DAYS,
  MAX_MERCHANT_PRODUCT_IDS,
  MAX_MERCHANT_USAGE_SUMMARY_DAYS,
} from "../limitations.ts";
import { hasUniqueValues } from "../utils.ts";
import { userIdSchema } from "./attribution.ts";
import { providerTypeSchema } from "./providers.ts";

/**
 * Tenant-owned merchant monetization wire entities (ADR-0048). Credentials
 * never appear here — only the display fragment survives serialization.
 */
export const merchantProviderSchema = z.enum(["polar", "dodo"]);
export type MerchantProviderKind = z.infer<typeof merchantProviderSchema>;

export const merchantEnvironmentSchema = z.enum(["sandbox", "live"]);

export const merchantGuardSchema = z
  .object({
    enabled: z.boolean(),
    productIds: z
      .array(z.string().min(1))
      .max(MAX_MERCHANT_PRODUCT_IDS)
      .refine(hasUniqueValues, {
        message: "Guard product ids must be unique.",
      }),
    meterId: z.string().min(1).nullable(),
  })
  .strict()
  .refine(
    (guard) =>
      !guard.enabled || guard.productIds.length > 0 || guard.meterId !== null,
    {
      message:
        "An enabled guard requires at least one product id or a meter id.",
    }
  );
export type MerchantGuard = z.infer<typeof merchantGuardSchema>;

export const merchantConnectionSchema = z
  .object({
    id: merchantConnectionIdSchema,
    provider: merchantProviderSchema,
    environment: merchantEnvironmentSchema,
    merchantAccountId: z.string().min(1),
    keyFragment: providerKeyFragmentSchema,
    guard: merchantGuardSchema,
    configVersion: z.number().int().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();
export type MerchantConnection = z.infer<typeof merchantConnectionSchema>;

export const merchantConnectionResponseSchema = z
  .object({ connection: merchantConnectionSchema.nullable() })
  .strip();
export type MerchantConnectionResponse = z.infer<
  typeof merchantConnectionResponseSchema
>;

export const createMerchantConnectionBodySchema = z
  .object({
    provider: merchantProviderSchema.describe(
      "Your billing provider: `polar` or `dodo`."
    ),
    environment: merchantEnvironmentSchema.describe(
      "The provider environment to send usage to: `sandbox` or `live`."
    ),
    credential: z
      .string()
      .min(1)
      .describe(
        "A credential for your provider account: a Polar Organization Access Token, or a Dodo API key in the mode that matches `environment`. It is never returned."
      ),
    guard: merchantGuardSchema
      .optional()
      .describe(
        "Check each end user's plan or balance with your provider before every turn starts. Off when left out."
      ),
  })
  .strict();
export type CreateMerchantConnectionBody = z.infer<
  typeof createMerchantConnectionBodySchema
>;

export const updateMerchantConnectionBodySchema = z
  .object({
    credential: z
      .string()
      .min(1)
      .optional()
      .describe(
        "A replacement credential. It must belong to the same merchant account as the current one."
      ),
    guard: merchantGuardSchema
      .optional()
      .describe("The complete guard configuration, replacing the current one."),
  })
  .strict();
export type UpdateMerchantConnectionBody = z.infer<
  typeof updateMerchantConnectionBodySchema
>;

export const merchantCustomerBindingSchema = z
  .object({
    userId: userIdSchema.min(1),
    customerId: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();
export type MerchantCustomerBinding = z.infer<
  typeof merchantCustomerBindingSchema
>;

export const merchantBindingsResponseSchema = z
  .object({
    bindings: z.array(merchantCustomerBindingSchema),
    nextCursor: z.string().nullable(),
  })
  .strip();
export type MerchantBindingsResponse = z.infer<
  typeof merchantBindingsResponseSchema
>;

export const upsertMerchantBindingBodySchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("The ID of the customer in your billing provider."),
  })
  .strict();
export type UpsertMerchantBindingBody = z.infer<
  typeof upsertMerchantBindingBodySchema
>;

export const merchantBindingResponseSchema = z
  .object({ binding: merchantCustomerBindingSchema })
  .strip();
export type MerchantBindingResponse = z.infer<
  typeof merchantBindingResponseSchema
>;

export const merchantUsageEventStatusSchema = z.enum([
  "pending",
  "accepted",
  "failed",
  "incomplete",
  "discarded",
  "expired",
]);
export type MerchantUsageEventStatus = z.infer<
  typeof merchantUsageEventStatusSchema
>;

export const merchantUsageEventNextActionSchema = z.enum([
  "none",
  "wait",
  "retry",
  "investigate",
  "discard",
]);

export const merchantUsageEventSchema = z
  .object({
    id: merchantUsageEventIdSchema,
    turnId: turnIdSchema,
    connectionId: merchantConnectionIdSchema,
    provider: merchantProviderSchema,
    userId: userIdSchema,
    customerId: z.string().min(1).nullable(),
    agentId: agentIdSchema,
    sessionId: sessionIdSchema.nullable(),
    model: z.string().min(1),
    modelProvider: providerTypeSchema,
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0),
    turnStatus: z.enum(["succeeded", "cancelled", "failed"]),
    startedAt: z.iso.datetime({ offset: true }),
    occurredAt: z.iso.datetime({ offset: true }),
    status: merchantUsageEventStatusSchema,
    payload: z.record(z.string(), z.unknown()).nullable(),
    attemptCount: z.number().int().min(0),
    attemptGeneration: z.number().int().min(0),
    lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
    lastErrorCode: z.string().nullable(),
    acceptedAt: z.iso.datetime({ offset: true }).nullable(),
    nextAction: merchantUsageEventNextActionSchema,
  })
  .strip();
export type MerchantUsageEvent = z.infer<typeof merchantUsageEventSchema>;

export const merchantUsageEventResponseSchema = z
  .object({ event: merchantUsageEventSchema })
  .strip();
export type MerchantUsageEventResponse = z.infer<
  typeof merchantUsageEventResponseSchema
>;

export const merchantUsageEventsResponseSchema = z
  .object({
    events: z.array(merchantUsageEventSchema),
    nextCursor: z.string().nullable(),
  })
  .strip();
export type MerchantUsageEventsResponse = z.infer<
  typeof merchantUsageEventsResponseSchema
>;

/**
 * Delivery-health aggregate behind `GET /v1/merchant-usage-events/summary` —
 * all-time status counts plus a UTC daily window so a dashboard can show
 * whether deliveries are flowing without scanning the ledger.
 */
export const merchantUsageSummaryCountsSchema = z
  .object({
    pending: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    discarded: z.number().int().nonnegative(),
  })
  .strict();

export const merchantUsageSummaryDaySchema = z
  .object({
    day: z.iso.date(),
    acceptedEvents: z.number().int().nonnegative(),
    acceptedTokens: z.number().int().nonnegative(),
    pendingEvents: z.number().int().nonnegative(),
  })
  .strict();

export const merchantUsageSummarySchema = z
  .object({
    counts: merchantUsageSummaryCountsSchema,
    lastAcceptedAt: z.iso.datetime({ offset: true }).nullable(),
    oldestPendingOccurredAt: z.iso.datetime({ offset: true }).nullable(),
    daily: z.array(merchantUsageSummaryDaySchema),
  })
  .strict();
export type MerchantUsageSummary = z.infer<typeof merchantUsageSummarySchema>;

export const merchantUsageSummaryQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_MERCHANT_USAGE_SUMMARY_DAYS)
      .default(DEFAULT_MERCHANT_USAGE_SUMMARY_DAYS)
      .describe(
        `UTC days in the \`daily\` series, ending today, from 1 to ${MAX_MERCHANT_USAGE_SUMMARY_DAYS}.`
      ),
  })
  .strict();

export const merchantUsageSummaryResponseSchema = z
  .object({ summary: merchantUsageSummarySchema })
  .strip();
export type MerchantUsageSummaryResponse = z.infer<
  typeof merchantUsageSummaryResponseSchema
>;

/**
 * The action a Tenant takes on an event. `automaticDeliveryStopped` is true
 * when automatic delivery has given up on a `pending` event.
 */
export function merchantUsageEventNextAction(event: {
  automaticDeliveryStopped: boolean;
  status: MerchantUsageEventStatus;
}): z.infer<typeof merchantUsageEventNextActionSchema> {
  switch (event.status) {
    case "accepted":
    case "discarded":
      return "none";
    case "pending":
      return event.automaticDeliveryStopped ? "retry" : "wait";
    case "failed":
      return "retry";
    case "incomplete":
      return "investigate";
    case "expired":
      return "discard";
  }
}
