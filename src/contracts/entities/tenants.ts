import { z } from "zod";
import { MAX_TENANT_NAME_LENGTH } from "../limitations.ts";
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

export const tenantSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TENANT_NAME_LENGTH),
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
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });
export type TenantDeletion = z.infer<typeof tenantDeletionSchema>;
export type TenantSettingsResponse = z.infer<
  typeof tenantSettingsResponseSchema
>;
export type UpdateTenantSettingsBody = z.infer<
  typeof updateTenantSettingsBodySchema
>;
