import {
  workspaceSchema,
  workspacesListResponseSchema,
} from "../contracts/entities/workspaces.ts";
import { requestJson, requestStream } from "../http.ts";
import type { HttpConfig, WorkspacesResource } from "../types.ts";

/**
 * Builds the Workspaces operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createWorkspacesResource(
  config: HttpConfig
): WorkspacesResource {
  return {
    /**
     * Creates workspaces.
     */
    async create({ abortSignal, ...body } = {}) {
      return await requestJson(
        config,
        "/v1/workspaces",
        {
          json: body,
          signal: abortSignal,
          method: "POST",
        },
        workspaceSchema
      );
    },
    /**
     * Deletes workspaces.
     */
    async delete({ workspaceId, abortSignal }) {
      const response = await requestStream(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { method: "DELETE", signal: abortSignal }
      );
      return response.status === 202 ? "pending" : "completed";
    },
    /**
     * Retrieves workspaces.
     */
    async get({ workspaceId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { signal: abortSignal },
        workspaceSchema
      );
    },
    /**
     * Lists one page of workspaces.
     */
    async list({ abortSignal, ...options } = {}) {
      return await requestJson(
        config,
        "/v1/workspaces",
        {
          signal: abortSignal,
          query: {
            cursor: options.cursor,
            limit: options.limit,
            userId: options.userId,
          },
        },
        workspacesListResponseSchema
      );
    },
    /**
     * Updates workspaces.
     */
    async update({ workspaceId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { json: body, signal: abortSignal, method: "PUT" },
        workspaceSchema
      );
    },
  };
}
