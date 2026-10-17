import {
  merchantBindingResponseSchema,
  merchantBindingsResponseSchema,
} from "../contracts/entities/merchant.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, MerchantBindingsResource } from "../types.ts";

/**
 * `client.merchantBindings` — list/put/delete over
 * `/v1/merchant-connection/bindings`. `put` upserts the end user's provider
 * customer; the server validates the customer with the provider before
 * storing.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createMerchantBindingsResource(
  config: HttpConfig
): MerchantBindingsResource {
  return {
    /**
     * Lists one page of merchant bindings.
     */
    async list({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-connection/bindings",
        { query, signal: abortSignal },
        merchantBindingsResponseSchema
      );
    },
    /**
     * Validates and saves merchant bindings.
     */
    async put({ userId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/merchant-connection/bindings/${userId}`,
        { json: body, method: "PUT", signal: abortSignal },
        merchantBindingResponseSchema
      );
    },
    /**
     * Deletes merchant bindings.
     */
    async delete({ userId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/merchant-connection/bindings/${userId}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
  };
}
