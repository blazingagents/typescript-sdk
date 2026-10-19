import {
  type CreateProviderBody,
  type DeleteProviderOptions,
  type ProviderModelsResponse,
  type ProviderResponse,
  type ProvidersResponse,
  providerModelsResponseSchema,
  providerResponseSchema,
  providersResponseSchema,
  type ThinkingLevelsResponse,
  thinkingLevelsResponseSchema,
  type UpdateProviderBody,
} from "../contracts/entities/providers.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface ProvidersResource {
  /**
   * Creates the Provider.
   * @param input - creation fields; optional abortSignal.
   * @returns The provider response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateProviderBody & ResourceRequestOptions
  ): Promise<ProviderResponse>;
  /**
   * Deletes the Provider.
   * @param input - `providerId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: DeleteProviderOptions & {
      providerId: string;
    } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retrieves the Provider.
   * @param input - `providerId`; optional abortSignal.
   * @returns The provider response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderResponse>;
  /**
   * Retrieves supported thinking levels for a Provider model.
   * @param input - `providerId`, provider-specific `model` name, and optional abortSignal.
   * @returns The thinking levels response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getThinkingLevels(
    input: { providerId: string; model: string } & ResourceRequestOptions
  ): Promise<ThinkingLevelsResponse>;
  /**
   * Lists available Provider records.
   * @param input - optional abortSignal.
   * @returns The providers response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ResourceRequestOptions): Promise<ProvidersResponse>;
  /**
   * Lists models exposed by the Provider.
   * @param input - `providerId`; optional abortSignal.
   * @returns The provider models response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listModels(
    input: { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderModelsResponse>;
  /**
   * Updates the Provider.
   * @param input - `providerId`; fields to change; optional abortSignal.
   * @returns The provider response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateProviderBody & { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderResponse>;
}

/**
 * `client.providers` — CRUD and cost-free model discovery.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createProvidersResource(config: HttpConfig): ProvidersResource {
  return {
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/providers",
        {
          json: body,
          credentialBearing: true,
          signal: abortSignal,
          method: "POST",
        },
        providerResponseSchema
      );
    },
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/providers",
        { credentialBearing: true, signal: abortSignal },
        providersResponseSchema
      );
    },
    async get({ providerId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/providers/${providerId}`,
        { credentialBearing: true, signal: abortSignal },
        providerResponseSchema
      );
    },
    async listModels({ providerId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/providers/${providerId}/models`,
        { credentialBearing: true, signal: abortSignal },
        providerModelsResponseSchema
      );
    },
    async getThinkingLevels({ providerId, model, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/providers/${providerId}/thinking-levels`,
        { credentialBearing: true, signal: abortSignal, query: { model } },
        thinkingLevelsResponseSchema
      );
    },
    async update({ providerId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/providers/${providerId}`,
        {
          json: body,
          credentialBearing: true,
          signal: abortSignal,
          method: "PATCH",
        },
        providerResponseSchema
      );
    },
    async delete({ providerId, abortSignal, ...options }) {
      await requestJson<void>(config, apiPath`/v1/providers/${providerId}`, {
        method: "DELETE",
        credentialBearing: true,
        signal: abortSignal,
        query: {
          confirmSnapshotInvalidation: options.confirmSnapshotInvalidation,
        },
      });
    },
  };
}
