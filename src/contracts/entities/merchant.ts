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
export const merchantConnectionStatusSchema = z.enum([
  "active",
  "disconnected",
]);

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
    status: merchantConnectionStatusSchema,
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
    provider: merchantProviderSchema,
    environment: merchantEnvironmentSchema,
    credential: z.string().min(1),
    guard: merchantGuardSchema.optional(),
  })
  .strict();
export type CreateMerchantConnectionBody = z.infer<
  typeof createMerchantConnectionBodySchema
>;

export const updateMerchantConnectionBodySchema = z
  .object({
    credential: z.string().min(1).optional(),
    status: merchantConnectionStatusSchema.optional(),
    guard: merchantGuardSchema.optional(),
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
  .object({ customerId: z.string().min(1) })
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
  "uncertain",
  "unmapped",
  "incomplete",
  "discarded",
  "expired",
]);
export type MerchantUsageEventStatus = z.infer<
  typeof merchantUsageEventStatusSchema
>;

export const merchantWorkflowIssueSchema = z.enum([
  "error",
  "cancelled",
  "recovery_exhausted",
]);

export const merchantUsageEventNextActionSchema = z.enum([
  "none",
  "wait",
  "retry",
  "bind_and_release",
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
    workflowIssue: merchantWorkflowIssueSchema.nullable(),
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
    uncertain: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unmapped: z.number().int().nonnegative(),
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
      .default(DEFAULT_MERCHANT_USAGE_SUMMARY_DAYS),
  })
  .strict();

export const merchantUsageSummaryResponseSchema = z
  .object({ summary: merchantUsageSummarySchema })
  .strip();
export type MerchantUsageSummaryResponse = z.infer<
  typeof merchantUsageSummaryResponseSchema
>;

/**
 * The operator-facing action derived from event state — computed at the
 * service seam, never persisted.
 */
export function merchantUsageEventNextAction(event: {
  status: MerchantUsageEventStatus;
  workflowIssue: z.infer<typeof merchantWorkflowIssueSchema> | null;
}): z.infer<typeof merchantUsageEventNextActionSchema> {
  switch (event.status) {
    case "accepted":
    case "discarded":
      return "none";
    case "pending":
      return event.workflowIssue === null ? "wait" : "retry";
    case "failed":
    case "uncertain":
      return "retry";
    case "unmapped":
      return "bind_and_release";
    case "incomplete":
      return "investigate";
    case "expired":
      return "discard";
  }
}
