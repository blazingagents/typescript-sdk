import { z } from "zod";
import { tenantIdSchema } from "../ids.ts";
import {
  MAX_QUOTA_RESET_DAY,
  MAX_TENANT_NAME_LENGTH,
  MIN_QUOTA_RESET_DAY,
} from "../limitations.ts";
import { atLeastOneFieldMessage, hasObjectKeys } from "../utils.ts";

/**
 * `GET /v1/me` (JWT-only) — the tenant record. `authUserId` is a uuid
 * referencing `auth.users(id)` per the migration.
 */
export const tenantSchema = z
  .object({
    id: tenantIdSchema,
    authUserId: z.uuid(),
    email: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const subscriptionStatusSchema = z.enum(["active", "inactive"]);

export const tenantResponseSchema = tenantSchema
  .extend({ subscriptionStatus: subscriptionStatusSchema })
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
    quota: quotaSchema.nullable(),
  })
  .strict();

export const tenantSettingsResponseSchema = tenantSettingsSchema;

export const updateTenantSettingsBodySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TENANT_NAME_LENGTH).optional(),
    quota: quotaSchema.nullable().optional(),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

export type Tenant = z.infer<typeof tenantSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type TenantResponse = z.infer<typeof tenantResponseSchema>;
export type Quota = z.infer<typeof quotaSchema>;
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;
export type TenantSettingsResponse = z.infer<
  typeof tenantSettingsResponseSchema
>;
export type UpdateTenantSettingsBody = z.infer<
  typeof updateTenantSettingsBodySchema
>;
