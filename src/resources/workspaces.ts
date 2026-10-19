import {
  type CreateWorkspaceBody,
  type UpdateWorkspaceBody,
  type Workspace,
  type WorkspacesListResponse,
  workspaceSchema,
  workspacesListResponseSchema,
} from "../contracts/entities/workspaces.ts";
import { apiPath, requestJson, requestStream } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface WorkspacesResource {
  /**
   * Creates the Workspace.
   * @param input - creation fields; optional abortSignal.
   * @returns The workspace.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input?: CreateWorkspaceBody & ResourceRequestOptions
  ): Promise<Workspace>;
  /**
   * Deletes the Workspace.
   * @param input - `workspaceId`; optional abortSignal.
   * @returns "pending" while deletion is underway, otherwise "completed".
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { workspaceId: string } & ResourceRequestOptions
  ): Promise<"completed" | "pending">;
  /**
   * Retrieves the Workspace.
   * @param input - `workspaceId`; optional abortSignal.
   * @returns The workspace.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { workspaceId: string } & ResourceRequestOptions
  ): Promise<Workspace>;
  /**
   * Lists one page of Workspace records.
   * @param input - filters and pagination options.
   * @returns The workspaces list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: WorkspacesListOptions): Promise<WorkspacesListResponse>;
  /**
   * Updates the Workspace.
   * @param input - `workspaceId`; fields to change; optional abortSignal.
   * @returns The workspace.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateWorkspaceBody & {
      workspaceId: string;
    } & ResourceRequestOptions
  ): Promise<Workspace>;
}

export interface WorkspacesListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

/**
 * Builds the Workspaces operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
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
        apiPath`/v1/workspaces/${workspaceId}`,
        { method: "DELETE", signal: abortSignal }
      );
      return response.status === 202 ? "pending" : "completed";
    },
    async get({ workspaceId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/workspaces/${workspaceId}`,
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
        apiPath`/v1/workspaces/${workspaceId}`,
        { json: body, signal: abortSignal, method: "PUT" },
        workspaceSchema
      );
    },
  };
}
