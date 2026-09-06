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
 */

export function createProvidersResource(config: HttpConfig): ProvidersResource {
  return {
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
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/providers",
        { signal: abortSignal },
        providersResponseSchema
      );
    },
    async get({ providerId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}`,
        { signal: abortSignal },
        providerResponseSchema
      );
    },
    async listModels({ providerId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}/models`,
        { signal: abortSignal },
        providerModelsResponseSchema
      );
    },
    async getThinkingLevels({ providerId, model, abortSignal }) {
      return await requestJson(
        config,
        `/v1/providers/${providerId}/thinking-levels`,
        { signal: abortSignal, query: { model } },
        thinkingLevelsResponseSchema
      );
    },
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
    async delete({ providerId, abortSignal, ...options }) {
      await requestJson<void>(config, `/v1/providers/${providerId}`, {
        method: "DELETE",
        signal: abortSignal,
        query: {
          confirmVersionInvalidation: options.confirmVersionInvalidation,
        },
      });
    },
  };
}
