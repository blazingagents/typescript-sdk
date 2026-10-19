import {
  type MerchantBindingResponse,
  type MerchantBindingsResponse,
  merchantBindingResponseSchema,
  merchantBindingsResponseSchema,
  type UpsertMerchantBindingBody,
} from "../contracts/entities/merchant.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface MerchantBindingsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

/**
 * `client.merchantBindings` — end-user → provider customer bindings behind
 * `/v1/merchant-connection/bindings`. `put` validates the customer against
 * the provider.
 */
export interface MerchantBindingsResource {
  /**
   * Deletes the end-user merchant binding.
   * @param input - `userId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { userId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Lists one page of end-user merchant binding records.
   * @param input - filters and pagination options.
   * @returns The merchant bindings response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: MerchantBindingsListOptions): Promise<MerchantBindingsResponse>;
  /**
   * Validates and saves the end-user merchant binding.
   * @param input - `userId`; fields to change; optional abortSignal.
   * @returns The merchant binding response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  put(
    input: UpsertMerchantBindingBody & {
      userId: string;
    } & ResourceRequestOptions
  ): Promise<MerchantBindingResponse>;
}

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
        apiPath`/v1/merchant-connection/bindings/${userId}`,
        { json: body, method: "PUT", signal: abortSignal },
        merchantBindingResponseSchema
      );
    },
    async delete({ userId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/merchant-connection/bindings/${userId}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
  };
}
