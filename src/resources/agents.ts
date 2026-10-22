import {
  type Agent,
  type AgentsResponse,
  agentResponseSchema,
  agentsResponseSchema,
  type CreateAgentBody,
  type UpdateAgentBody,
} from "../contracts/entities/agents.ts";
import {
  type McpAttachmentResponse,
  type McpAttachmentsResponse,
  mcpAttachmentResponseSchema,
  mcpAttachmentsResponseSchema,
  type UpdateMcpAttachmentBody,
} from "../contracts/entities/mcp-connections.ts";
import {
  type SpendingLimitResponse,
  spendingLimitResponseSchema,
  type UpdateSpendingLimitBody,
} from "../contracts/entities/spending-limits.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

/** Agent operations on a user-scoped client, which has no spending limits. */
export type UserAgentsResource = Omit<
  AgentsResource,
  "getSpendingLimit" | "updateSpendingLimit"
>;

export interface AgentsResource {
  /**
   * Creates the Agent. Omitting `workspaceId` creates a Core Workspace by default. `workspaceTier` selects its immutable tier and conflicts with `workspaceId`.
   * @param input - creation fields; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(input: CreateAgentBody & ResourceRequestOptions): Promise<Agent>;
  /**
   * Deletes the Agent while preserving its attached Workspace.
   * @param input - `agentId`; optional abortSignal; includeArtifacts controls Artifact deletion.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response; `agent_busy` (409) while the Agent has a live Turn or a queued or running Task run.
   */
  delete(
    input: {
      agentId: string;
      includeArtifacts: boolean;
    } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Disables the Agent.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  disable(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  /**
   * Enables the Agent.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  enable(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  /**
   * Retrieves the Agent.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  /** Retrieves the Agent model spending limit. Requires tenant authority. */
  getSpendingLimit(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<SpendingLimitResponse>;
  /**
   * Lists available Agent records.
   * @param input - filters and pagination options.
   * @returns Matching Agents. This response has no pagination cursor.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: AgentsListOptions): Promise<AgentsResponse>;
  /**
   * Lists the Agent MCP attachments.
   * @param input - `agentId`; optional abortSignal.
   * @returns The mcp attachments response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listMcpAttachments(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<McpAttachmentsResponse>;
  /**
   * Removes the Agent avatar.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  removeAvatar(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<Agent>;
  /**
   * Updates the Agent. A concrete `workspaceId` switches the Agent; detachment is unsupported.
   * @param input - `agentId`; fields to change; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateAgentBody & { agentId: string } & ResourceRequestOptions
  ): Promise<Agent>;
  /**
   * Updates one Agent MCP attachment.
   * @param input - `agentId`, `mcpConnectionId`; fields to change; optional abortSignal.
   * @returns The mcp attachment response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  updateMcpAttachment(
    input: UpdateMcpAttachmentBody & {
      agentId: string;
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpAttachmentResponse>;
  /** Sets the Agent model spending limit. Pass null to disable it. Requires tenant authority. */
  updateSpendingLimit(
    input: UpdateSpendingLimitBody & {
      agentId: string;
    } & ResourceRequestOptions
  ): Promise<SpendingLimitResponse>;
  /**
   * Uploads an Agent avatar as multipart form data.
   * @param input - Target `agentId`, image `file`, and optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  uploadAvatar(
    input: { agentId: string; file: File } & ResourceRequestOptions
  ): Promise<Agent>;
}

export interface AgentsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
  workspaceId?: string;
}

/**
 * Builds the Agents operations, including the spending limits that need tenant authority.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createAgentsResource(config: HttpConfig): AgentsResource {
  return {
    ...createUserAgentsResource(config),
    async getSpendingLimit({ agentId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/spending-limit`,
        { signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    async updateSpendingLimit({ agentId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/spending-limit`,
        { method: "PUT", json: body, signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
  };
}

/**
 * Builds the Agents operations a user-scoped client may call.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createUserAgentsResource(
  config: HttpConfig
): UserAgentsResource {
  /**
   * Updates agents.
   */
  const update: UserAgentsResource["update"] = async ({
    agentId,
    abortSignal,
    ...body
  }) =>
    requestJson(
      config,
      apiPath`/v1/agents/${agentId}`,
      {
        json: body,
        signal: abortSignal,
        method: "PUT",
      },
      agentResponseSchema
    );

  return {
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/agents",
        {
          json: body,
          signal: abortSignal,
          method: "POST",
        },
        agentResponseSchema
      );
    },
    async list(options = {}) {
      return await requestJson(
        config,
        "/v1/agents",
        {
          signal: options.abortSignal,
          query: {
            cursor: options.cursor,
            limit: options.limit,
            userId: options.userId,
            workspaceId: options.workspaceId,
          },
        },
        agentsResponseSchema
      );
    },
    async get({ agentId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}`,
        { signal: abortSignal },
        agentResponseSchema
      );
    },
    async disable({ agentId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/disable`,
        { method: "POST", signal: abortSignal },
        agentResponseSchema
      );
    },
    async enable({ agentId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/enable`,
        { method: "POST", signal: abortSignal },
        agentResponseSchema
      );
    },
    async listMcpAttachments({ agentId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/mcp-attachments`,
        { signal: abortSignal },
        mcpAttachmentsResponseSchema
      );
    },
    update,
    async updateMcpAttachment({
      agentId,
      mcpConnectionId,
      abortSignal,
      ...body
    }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/mcp-attachments/${mcpConnectionId}`,
        { json: body, method: "PATCH", signal: abortSignal },
        mcpAttachmentResponseSchema
      );
    },
    async delete({ agentId, includeArtifacts, abortSignal }) {
      await requestJson<void>(config, apiPath`/v1/agents/${agentId}`, {
        method: "DELETE",
        query: { includeArtifacts },
        signal: abortSignal,
      });
    },
    async uploadAvatar({ agentId, file, abortSignal }) {
      const form = new FormData();
      form.append("file", file);
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/avatar`,
        {
          body: form,
          signal: abortSignal,
          method: "POST",
        },
        agentResponseSchema
      );
    },
    async removeAvatar({ agentId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/avatar`,
        { method: "DELETE", signal: abortSignal },
        agentResponseSchema
      );
    },
  };
}
