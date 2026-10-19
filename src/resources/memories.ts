import {
  type CreateMemoryBody,
  type MemoriesListResponse,
  type MemoryResponse,
  memoriesListResponseSchema,
  memoryResponseSchema,
  type UpdateMemoryBody,
} from "../contracts/entities/memories.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface MemoriesResource {
  /**
   * Creates the Memory.
   * @param input - `agentId`; creation fields; optional abortSignal.
   * @returns The memory response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateMemoryBody & { agentId: string } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
  /**
   * Deletes the Memory.
   * @param input - `agentId`, `memoryId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { agentId: string; memoryId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retrieves the Memory.
   * @param input - `agentId`, `memoryId`; optional abortSignal.
   * @returns The memory response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { agentId: string; memoryId: string } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
  /**
   * Lists one page of Memory records.
   * @param input - `agentId`; filters and pagination options.
   * @returns The memories list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input: { agentId: string } & MemoriesListOptions
  ): Promise<MemoriesListResponse>;
  /**
   * Updates the Memory.
   * @param input - `agentId`, `memoryId`; fields to change; optional abortSignal.
   * @returns The memory response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateMemoryBody & {
      agentId: string;
      memoryId: string;
    } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
}

export interface MemoriesListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  search?: string;
  userId?: string;
}

/**
 * `client.memories` — CRUD and query over `/v1/agents/:agentId/memories`.
 * Memories are Agent-nested; `userId` is stamped at creation and immutable,
 * while list can filter it (including explicit `''`) or full-text search.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createMemoriesResource(config: HttpConfig): MemoriesResource {
  return {
    async list({ agentId, abortSignal, ...options }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/memories`,
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
        apiPath`/v1/agents/${agentId}/memories`,
        { json: body, signal: abortSignal, method: "POST" },
        memoryResponseSchema
      );
    },
    async get({ agentId, memoryId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/memories/${memoryId}`,
        { signal: abortSignal },
        memoryResponseSchema
      );
    },
    async update({ agentId, memoryId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/memories/${memoryId}`,
        { json: body, signal: abortSignal, method: "PATCH" },
        memoryResponseSchema
      );
    },
    async delete({ agentId, memoryId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/agents/${agentId}/memories/${memoryId}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
  };
}
