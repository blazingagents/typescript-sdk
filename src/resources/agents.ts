import {
  agentResponseSchema,
  agentsResponseSchema,
} from "../contracts/entities/agents.ts";
import {
  mcpAttachmentResponseSchema,
  mcpAttachmentsResponseSchema,
} from "../contracts/entities/mcp-connections.ts";
import { requestJson } from "../http.ts";
import type { AgentsResource, HttpConfig } from "../types.ts";

export function createAgentsResource(config: HttpConfig): AgentsResource {
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
        `/v1/agents/${agentId}`,
        { signal: abortSignal },
        agentResponseSchema
      );
    },
    async disable({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/disable`,
        { method: "POST", signal: abortSignal },
        agentResponseSchema
      );
    },
    async enable({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/enable`,
        { method: "POST", signal: abortSignal },
        agentResponseSchema
      );
    },
    async listMcpAttachments({ agentId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/mcp-attachments`,
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
        `/v1/agents/${agentId}/mcp-attachments/${mcpConnectionId}`,
        { json: body, method: "PATCH", signal: abortSignal },
        mcpAttachmentResponseSchema
      );
    },
    async delete({ agentId, includeArtifacts, abortSignal }) {
      await requestJson<void>(config, `/v1/agents/${agentId}`, {
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
        `/v1/agents/${agentId}/avatar`,
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
        `/v1/agents/${agentId}/avatar`,
        { method: "DELETE", signal: abortSignal },
        agentResponseSchema
      );
    },
  };
}
