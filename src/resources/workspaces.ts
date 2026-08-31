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
    async create(body = {}) {
      return await requestJson(
        config,
        "/v1/workspaces",
        {
          json: body,
          method: "POST",
        },
        workspaceSchema
      );
    },
    async delete({ workspaceId }) {
      const response = await requestStream(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { method: "DELETE" }
      );
      return response.status === 202 ? "pending" : "completed";
    },
    async get({ workspaceId }) {
      return await requestJson(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        {},
        workspaceSchema
      );
    },
    async list(options = {}) {
      return await requestJson(
        config,
        "/v1/workspaces",
        {
          query: {
            cursor: options.cursor,
            limit: options.limit,
            userId: options.userId,
          },
        },
        workspacesListResponseSchema
      );
    },
    async update({ workspaceId, ...body }) {
      return await requestJson(
        config,
        `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
        { json: body, method: "PUT" },
        workspaceSchema
      );
    },
  };
}
