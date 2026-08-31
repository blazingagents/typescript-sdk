import {
  promptResponseSchema,
  promptsResponseSchema,
} from "../contracts/entities/prompts.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, PromptsResource } from "../types.ts";

/**
 * `client.prompts` — CRUD over `/v1/prompts`. The list endpoint is
 * unpaginated (bounded by the 100/tenant cap).
 */

export function createPromptsResource(config: HttpConfig): PromptsResource {
  return {
    async create(body) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          json: body,
          method: "POST",
        },
        promptResponseSchema
      );
    },
    async list(userId) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          // Stryker disable next-line ConditionalExpression: URL serialization omits an undefined query value.
          ...(userId === undefined ? {} : { query: { userId } }),
        },
        promptsResponseSchema
      );
    },
    async get(promptId) {
      return await requestJson(
        config,
        `/v1/prompts/${promptId}`,
        {},
        promptResponseSchema
      );
    },
    async update(promptId, body) {
      return await requestJson(
        config,
        `/v1/prompts/${promptId}`,
        {
          json: body,
          method: "PATCH",
        },
        promptResponseSchema
      );
    },
    async delete(promptId) {
      await requestJson<void>(config, `/v1/prompts/${promptId}`, {
        method: "DELETE",
      });
    },
  };
}
