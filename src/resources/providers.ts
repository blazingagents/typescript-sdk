import {
  providerModelsResponseSchema,
  providerResponseSchema,
  providersResponseSchema,
  thinkingLevelsResponseSchema,
} from "../contracts/entities/providers.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, ProvidersResource } from "../types.ts";

/**
 * `client.providers` — CRUD and cost-free model discovery.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createProvidersResource(config: HttpConfig): ProvidersResource {
  return {
    /**
     * Creates providers.
     */
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/providers",
        {
          json: body,
          signal: abortSignal,
          method: "POST",
        },
        providerResponseSchema
      );
    },
    /**
     * Lists one page of providers.
     */
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/providers",
        { signal: abortSignal },
        providersResponseSchema
      );
    },
    /**
     * Retrieves providers.
     */
    async get({ providerId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}`,
        { signal: abortSignal },
        providerResponseSchema
      );
    },
    /**
     * Lists models exposed by the Provider.
     */
    async listModels({ providerId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}/models`,
        { signal: abortSignal },
        providerModelsResponseSchema
      );
    },
    /**
     * Retrieves supported thinking levels for a Provider model.
     */
    async getThinkingLevels({ providerId, model, abortSignal }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}/thinking-levels`,
        { signal: abortSignal, query: { model } },
        thinkingLevelsResponseSchema
      );
    },
    /**
     * Updates providers.
     */
    async update({ providerId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}`,
        {
          json: body,
          signal: abortSignal,
          method: "PATCH",
        },
        providerResponseSchema
      );
    },
    /**
     * Deletes providers.
     */
    async delete({ providerId, abortSignal, ...options }) {
      await requestJson<void>(config, `/v1/providers/${providerId}`, {
        method: "DELETE",
        signal: abortSignal,
        query: {
          confirmSnapshotInvalidation: options.confirmSnapshotInvalidation,
        },
      });
    },
  };
}
