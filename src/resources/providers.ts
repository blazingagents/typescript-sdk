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
    async create(body) {
      return await requestJson(
        config,
        "/v1/providers",
        {
          json: body,
          method: "POST",
        },
        providerResponseSchema
      );
    },
    async list(options = {}) {
      return await requestJson(
        config,
        "/v1/providers",
        options,
        providersResponseSchema
      );
    },
    async get(id, options = {}) {
      return await requestJson(
        config,
        `/v1/providers/${id}`,
        options,
        providerResponseSchema
      );
    },
    async listModels(id, options = {}) {
      return await requestJson(
        config,
        `/v1/providers/${id}/models`,
        options,
        providerModelsResponseSchema
      );
    },
    async getThinkingLevels(id, model, options = {}) {
      return await requestJson(
        config,
        `/v1/providers/${id}/thinking-levels`,
        { ...options, query: { model } },
        thinkingLevelsResponseSchema
      );
    },
    async update(id, body) {
      return await requestJson(
        config,
        `/v1/providers/${id}`,
        {
          json: body,
          method: "PATCH",
        },
        providerResponseSchema
      );
    },
    async delete(id, options = {}) {
      await requestJson<void>(config, `/v1/providers/${id}`, {
        method: "DELETE",
        query: {
          confirmVersionInvalidation: options.confirmVersionInvalidation,
        },
      });
    },
  };
}
