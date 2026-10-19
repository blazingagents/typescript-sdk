import {
  type CreateMerchantConnectionBody,
  type MerchantConnectionResponse,
  merchantConnectionResponseSchema,
  type UpdateMerchantConnectionBody,
} from "../contracts/entities/merchant.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

/**
 * `client.merchantConnection` — the tenant's own Polar/Dodo merchant
 * connection (ADR-0048). `credential` is write-only: responses expose only
 * `keyFragment`.
 */
export interface MerchantConnectionResource {
  /**
   * Creates the merchant connection.
   * @param input - creation fields; optional abortSignal.
   * @returns The merchant connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateMerchantConnectionBody & ResourceRequestOptions
  ): Promise<MerchantConnectionResponse>;
  /**
   * Retrieves the merchant connection.
   * @param input - optional abortSignal.
   * @returns The merchant connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(input?: ResourceRequestOptions): Promise<MerchantConnectionResponse>;
  /**
   * Retires the merchant connection and stops deliveries.
   * @param input - optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  retire(input?: ResourceRequestOptions): Promise<void>;
  /**
   * Updates the merchant connection.
   * @param input - fields to change; optional abortSignal.
   * @returns The merchant connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateMerchantConnectionBody & ResourceRequestOptions
  ): Promise<MerchantConnectionResponse>;
}

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
    async get({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-connection",
        { credentialBearing: true, signal: abortSignal },
        merchantConnectionResponseSchema
      );
    },
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/merchant-connection",
        {
          json: body,
          method: "POST",
          credentialBearing: true,
          signal: abortSignal,
        },
        merchantConnectionResponseSchema
      );
    },
    async update({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/merchant-connection",
        {
          json: body,
          method: "PATCH",
          credentialBearing: true,
          signal: abortSignal,
        },
        merchantConnectionResponseSchema
      );
    },
    async retire({ abortSignal } = {}) {
      await requestJson<void>(config, "/v1/merchant-connection", {
        method: "DELETE",
        credentialBearing: true,
        signal: abortSignal,
      });
    },
  };
}
