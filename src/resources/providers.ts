import {
  providerModelsResponseSchema,
  providerResponseSchema,
  providersResponseSchema,
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
    async list() {
      return await requestJson(
        config,
        "/v1/providers",
        {},
        providersResponseSchema
      );
    },
    async get(id) {
      return await requestJson(
        config,
        `/v1/providers/${id}`,
        {},
        providerResponseSchema
      );
    },
    async listModels(id) {
      return await requestJson(
        config,
        `/v1/providers/${id}/models`,
        {},
        providerModelsResponseSchema
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
