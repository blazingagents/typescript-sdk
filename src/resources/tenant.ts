import {
  type SpendingLimitResponse,
  spendingLimitResponseSchema,
  type UpdateSpendingLimitBody,
} from "../contracts/entities/spending-limits.ts";
import {
  type TenantSettingsResponse,
  tenantSettingsResponseSchema,
  type UpdateTenantSettingsBody,
} from "../contracts/entities/tenants.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface TenantResource {
  /**
   * Retrieves Tenant settings.
   * @param input - optional abortSignal.
   * @returns The tenant settings response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(input?: ResourceRequestOptions): Promise<TenantSettingsResponse>;
  /** Retrieves the tenant model spending limit. Requires tenant authority. */
  getSpendingLimit(
    input?: ResourceRequestOptions
  ): Promise<SpendingLimitResponse>;
  /**
   * Updates Tenant settings.
   * @param input - fields to change; optional abortSignal.
   * @returns The tenant settings response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  patch(
    input: UpdateTenantSettingsBody & ResourceRequestOptions
  ): Promise<TenantSettingsResponse>;
  /** Sets the tenant model spending limit. Pass null to disable it. Requires tenant authority. */
  updateSpendingLimit(
    input: UpdateSpendingLimitBody & ResourceRequestOptions
  ): Promise<SpendingLimitResponse>;
}

/**
 * `client.tenant` — get/patch over `/v1/tenant` (the tenant's self-set
 * quota row). `quota: null` means unlimited (no row).
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createTenantResource(config: HttpConfig): TenantResource {
  return {
    async getSpendingLimit({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/tenant/spending-limit",
        { signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    async updateSpendingLimit({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/tenant/spending-limit",
        { method: "PUT", json: body, signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    async get({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/tenant",
        { signal: abortSignal },
        tenantSettingsResponseSchema
      );
    },
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
