import { spendingLimitResponseSchema } from "../contracts/entities/spending-limits.ts";
import { tenantSettingsResponseSchema } from "../contracts/entities/tenants.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, TenantResource } from "../types.ts";

/**
 * `client.tenant` — get/patch over `/v1/tenant` (the tenant's self-set
 * quota row). `quota: null` means unlimited (no row).
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createTenantResource(config: HttpConfig): TenantResource {
  return {
    /** Retrieves the model spending limit using tenant authority. */
    async getSpendingLimit({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/tenant/spending-limit",
        { signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    /** Sets the model spending limit. Null disables it. Requires tenant authority. */
    async updateSpendingLimit({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/tenant/spending-limit",
        { method: "PUT", json: body, signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    /**
     * Retrieves tenant.
     */
    async get({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/tenant",
        { signal: abortSignal },
        tenantSettingsResponseSchema
      );
    },
    /**
     * Updates tenant.
     */
    async patch({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/tenant",
        {
          json: body,
          signal: abortSignal,
          method: "PATCH",
        },
        tenantSettingsResponseSchema
      );
    },
  };
}
