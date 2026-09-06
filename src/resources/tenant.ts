import { tenantSettingsResponseSchema } from "../contracts/entities/tenants.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, TenantResource } from "../types.ts";

/**
 * `client.tenant` — get/patch over `/v1/tenant` (the tenant's self-set
 * quota row). `quota: null` means unlimited (no row).
 */

export function createTenantResource(config: HttpConfig): TenantResource {
  return {
    async get(options = {}) {
      return await requestJson(
        config,
        "/v1/tenant",
        options,
        tenantSettingsResponseSchema
      );
    },
    async patch(body) {
      return await requestJson(
        config,
        "/v1/tenant",
        {
          json: body,
          method: "PATCH",
        },
        tenantSettingsResponseSchema
      );
    },
  };
}
