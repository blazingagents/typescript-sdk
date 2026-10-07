import {
  promptResponseSchema,
  promptsResponseSchema,
} from "../contracts/entities/prompts.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, PromptsResource } from "../types.ts";

/**
 * Builds the Prompts operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createPromptsResource(config: HttpConfig): PromptsResource {
  return {
    /**
     * Creates prompts.
     */
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
    /**
     * Lists one page of prompts.
     */
    async list({ userId, agentId, cursor, limit, abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          signal: abortSignal,
          query: { userId, agentId, cursor, limit },
        },
        promptsResponseSchema
      );
    },
    /**
     * Retrieves prompts.
     */
    async get({ promptId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/prompts/${promptId}`,
        { signal: abortSignal },
        promptResponseSchema
      );
    },
    /**
     * Updates prompts.
     */
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
    /**
     * Deletes prompts.
     */
    async delete({ promptId, abortSignal }) {
      await requestJson<void>(config, `/v1/prompts/${promptId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
