import { merchantConnectionResponseSchema } from "../contracts/entities/merchant.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, MerchantConnectionResource } from "../types.ts";

/**
 * `client.merchantConnection` — get/create/update/retire over
 * `/v1/merchant-connection`. One connection per tenant; `credential` is
 * write-only and never returned.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createMerchantConnectionResource(
  config: HttpConfig
): MerchantConnectionResource {
  return {
    /**
     * Retrieves merchant connection.
     */
    async get({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-connection",
        { signal: abortSignal },
        merchantConnectionResponseSchema
      );
    },
    /**
     * Creates merchant connection.
     */
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/merchant-connection",
        { json: body, method: "POST", signal: abortSignal },
        merchantConnectionResponseSchema
      );
    },
    /**
     * Updates merchant connection.
     */
    async update({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/merchant-connection",
        { json: body, method: "PATCH", signal: abortSignal },
        merchantConnectionResponseSchema
      );
    },
    /**
     * Retires merchant connection.
     */
    async retire({ abortSignal } = {}) {
      await requestJson<void>(config, "/v1/merchant-connection", {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
