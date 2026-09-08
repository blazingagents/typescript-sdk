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
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          json: body,
          signal: abortSignal,
          method: "POST",
        },
        promptResponseSchema
      );
    },
    async list({ userId, agentId, abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          signal: abortSignal,
          query: { userId, agentId },
        },
        promptsResponseSchema
      );
    },
    async get({ promptId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/prompts/${promptId}`,
        { signal: abortSignal },
        promptResponseSchema
      );
    },
    async update({ promptId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/prompts/${promptId}`,
        {
          json: body,
          signal: abortSignal,
          method: "PATCH",
        },
        promptResponseSchema
      );
    },
    async delete({ promptId, abortSignal }) {
      await requestJson<void>(config, `/v1/prompts/${promptId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
