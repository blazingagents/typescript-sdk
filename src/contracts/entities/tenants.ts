import { z } from "zod";
import {
  MAX_QUOTA_RESET_DAY,
  MAX_TENANT_NAME_LENGTH,
  MIN_QUOTA_RESET_DAY,
} from "../limitations.ts";
import { atLeastOneFieldMessage, hasObjectKeys } from "../utils.ts";

/**
 * Tenant deletion lifecycle — `requestedAt` marks the tenant deleting and
 * `deletesAt` is the scheduled permanent-deletion time (24 hours after
 * confirmation, cancellable until then). Deletion is dashboard-only; the
 * shape rides `GET /v1/tenant` settings so the dashboard can render it.
 */
export const tenantDeletionSchema = z
  .object({
    deletesAt: z.iso.datetime({ offset: true }),
    requestedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/**
 * Quota — `GET/PATCH /v1/tenant` carries the tenant's self-set quota.
 * `null` means unlimited (no quota row).
 */
export const quotaSchema = z
  .object({
    monthlyTokenLimit: z.number().int().positive().nullable(),
    monthlyRequestLimit: z.number().int().positive().nullable(),
    resetDay: z
      .number()
      .int()
      .min(MIN_QUOTA_RESET_DAY)
      .max(MAX_QUOTA_RESET_DAY),
  })
  .strict()
  .refine(
    ({ monthlyRequestLimit, monthlyTokenLimit }) =>
      monthlyRequestLimit !== null || monthlyTokenLimit !== null,
    { message: "At least one quota limit is required" }
  );

export const tenantSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TENANT_NAME_LENGTH),
    quota: quotaSchema.strip().nullable(),
  })
  .strip();

export const tenantSettingsResponseSchema = tenantSettingsSchema
  .extend({
    deletion: tenantDeletionSchema.nullable(),
    monetizationEnabled: z.boolean(),
  })
  .strip();

export const updateTenantSettingsBodySchema = z
  .object({
    monetizationEnabled: z
      .boolean()
      .optional()
      .describe(
        "Bill usage to your end users through your merchant account. Turning it off drops usage events your merchant has not yet accepted."
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .max(MAX_TENANT_NAME_LENGTH)
      .optional()
      .describe("Display name of your tenant."),
    quota: quotaSchema
      .nullable()
      .optional()
      .describe(
        "The whole monthly quota, replacing the current one, or `null` to remove it. Send `monthlyTokenLimit`, `monthlyRequestLimit`, and `resetDay`, with at least one limit set."
      ),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });
export type Quota = z.infer<typeof quotaSchema>;
export type TenantDeletion = z.infer<typeof tenantDeletionSchema>;
export type TenantSettingsResponse = z.infer<
  typeof tenantSettingsResponseSchema
>;
export type UpdateTenantSettingsBody = z.infer<
  typeof updateTenantSettingsBodySchema
>;
