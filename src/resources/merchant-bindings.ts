import {
  merchantBindingResponseSchema,
  merchantBindingsResponseSchema,
} from "../contracts/entities/merchant.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, MerchantBindingsResource } from "../types.ts";

/**
 * `client.merchantBindings` — list/put/delete over
 * `/v1/merchant-connection/bindings`. `put` upserts the end user's provider
 * customer; the server validates the customer with the provider before
 * storing.
 */
export function createMerchantBindingsResource(
  config: HttpConfig
): MerchantBindingsResource {
  return {
    async list({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-connection/bindings",
        { query, signal: abortSignal },
        merchantBindingsResponseSchema
      );
    },
    async put({ userId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/merchant-connection/bindings/${encodeURIComponent(userId)}`,
        { json: body, method: "PUT", signal: abortSignal },
        merchantBindingResponseSchema
      );
    },
    async delete({ userId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/merchant-connection/bindings/${encodeURIComponent(userId)}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
  };
}
