import {
  workspaceSchema,
  workspacesListResponseSchema,
} from "../contracts/entities/workspaces.ts";
import { requestJson, requestStream } from "../http.ts";
import type { HttpConfig, WorkspacesResource } from "../types.ts";

export function createWorkspacesResource(
  config: HttpConfig
): WorkspacesResource {
  return {
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
    async delete({ workspaceId, abortSignal }) {
      const response = await requestStream(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { method: "DELETE", signal: abortSignal }
      );
      return response.status === 202 ? "pending" : "completed";
    },
    async get({ workspaceId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { signal: abortSignal },
        workspaceSchema
      );
    },
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
