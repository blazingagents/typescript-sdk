import {
  agentResponseSchema,
  agentsResponseSchema,
} from "../contracts/entities/agents.ts";
import {
  mcpAttachmentResponseSchema,
  mcpAttachmentsResponseSchema,
} from "../contracts/entities/mcp-connections.ts";
import { spendingLimitResponseSchema } from "../contracts/entities/spending-limits.ts";
import { requestJson } from "../http.ts";
import type { AgentsResource, HttpConfig } from "../types.ts";

/**
 * Builds the Agents operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createAgentsResource(config: HttpConfig): AgentsResource {
  /**
   * Updates agents.
   */
  const update: AgentsResource["update"] = async ({
    agentId,
    abortSignal,
    ...body
  }) =>
    requestJson(
      config,
      `/v1/agents/${agentId}`,
      {
        json: body,
        signal: abortSignal,
        method: "PUT",
      },
      agentResponseSchema
    );

  return {
    /** Retrieves the model spending limit using tenant authority. */
    async getSpendingLimit({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/spending-limit`,
        { signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    /** Sets the model spending limit. Null disables it. Requires tenant authority. */
    async updateSpendingLimit({ agentId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/spending-limit`,
        { method: "PUT", json: body, signal: abortSignal },
        spendingLimitResponseSchema
      );
    },
    /**
     * Creates agents.
     */
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
    /**
     * Lists one page of agents.
     */
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
    /**
     * Retrieves agents.
     */
    async get({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}`,
        { signal: abortSignal },
        agentResponseSchema
      );
    },
    /**
     * Disables agents.
     */
    async disable({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/disable`,
        { method: "POST", signal: abortSignal },
        agentResponseSchema
      );
    },
    /**
     * Enables agents.
     */
    async enable({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/enable`,
        { method: "POST", signal: abortSignal },
        agentResponseSchema
      );
    },
    /**
     * Lists the Agent MCP attachments.
     */
    async listMcpAttachments({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/mcp-attachments`,
        { signal: abortSignal },
        mcpAttachmentsResponseSchema
      );
    },
    update,
    /**
     * Updates one Agent MCP attachment.
     */
    async updateMcpAttachment({
      agentId,
      mcpConnectionId,
      abortSignal,
      ...body
    }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/mcp-attachments/${mcpConnectionId}`,
        { json: body, method: "PATCH", signal: abortSignal },
        mcpAttachmentResponseSchema
      );
    },
    /**
     * Deletes agents.
     */
    async delete({ agentId, includeArtifacts, abortSignal }) {
      await requestJson<void>(config, `/v1/agents/${agentId}`, {
        method: "DELETE",
        query: { includeArtifacts },
        signal: abortSignal,
      });
    },
    /**
     * Uploads an Agent avatar as multipart form data.
     */
    async uploadAvatar({ agentId, file, abortSignal }) {
      const form = new FormData();
      form.append("file", file);
      return await requestJson(
        config,
        `/v1/agents/${agentId}/avatar`,
        {
          body: form,
          signal: abortSignal,
          method: "POST",
        },
        agentResponseSchema
      );
    },
    /**
     * Removes the Agent avatar.
     */
    async removeAvatar({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/avatar`,
        { method: "DELETE", signal: abortSignal },
        agentResponseSchema
      );
    },
  };
}
