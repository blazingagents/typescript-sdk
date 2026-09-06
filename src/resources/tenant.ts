import { tenantSettingsResponseSchema } from "../contracts/entities/tenants.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, TenantResource } from "../types.ts";

/**
 * `client.tenant` — get/patch over `/v1/tenant` (the tenant's self-set
 * quota row). `quota: null` means unlimited (no row).
 */

export function createTenantResource(config: HttpConfig): TenantResource {
  return {
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
