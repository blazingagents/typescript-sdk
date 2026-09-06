import {
  memoriesListResponseSchema,
  memoryResponseSchema,
} from "../contracts/entities/memories.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, MemoriesResource } from "../types.ts";

/**
 * `client.memories` — CRUD and query over `/v1/agents/:agentId/memories`.
 * Memories are Agent-nested; `userId` is stamped at creation and immutable,
 * while list can filter it (including explicit `''`) or full-text search.
 */

export function createMemoriesResource(config: HttpConfig): MemoriesResource {
  return {
    async list({ agentId, abortSignal, ...options }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/memories`,
        {
          signal: abortSignal,
          query: {
            ...(options.userId === undefined ? {} : { userId: options.userId }),
            search: options.search,
            cursor: options.cursor,
            limit: options.limit,
          },
        },
        memoriesListResponseSchema
      );
    },
    async create({ agentId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/memories`,
        { json: body, signal: abortSignal, method: "POST" },
        memoryResponseSchema
      );
    },
    async get({ agentId, memoryId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/memories/${memoryId}`,
        { signal: abortSignal },
        memoryResponseSchema
      );
    },
    async update({ agentId, memoryId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/memories/${memoryId}`,
        { json: body, signal: abortSignal, method: "PATCH" },
        memoryResponseSchema
      );
    },
    async delete({ agentId, memoryId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/agents/${agentId}/memories/${memoryId}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
  };
}
