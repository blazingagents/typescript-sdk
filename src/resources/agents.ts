import {
  agentResponseSchema,
  agentsResponseSchema,
  agentVersionSchema,
  agentVersionsResponseSchema,
} from "../contracts/entities/agents.ts";
import {
  mcpAttachmentResponseSchema,
  mcpAttachmentsResponseSchema,
} from "../contracts/entities/mcp-connections.ts";
import { requestJson } from "../http.ts";
import type { AgentsResource, HttpConfig } from "../types.ts";

/**
 * `client.agents` — full CRUD over `/v1/agents`. The list endpoint is
 * unpaginated (bounded by the 100/tenant cap); create/update bodies are
 * the core zod contracts' input shapes. Responses are parsed against the
 * core wire schemas (parse-on-read).
 */

export function createAgentsResource(config: HttpConfig): AgentsResource {
  const getVersion: AgentsResource["getVersion"] = async (agentId, version) =>
    requestJson(
      config,
      `/v1/agents/${agentId}/versions/${version}`,
      {},
      agentVersionSchema
    );
  const update: AgentsResource["update"] = async (agentId, body) =>
    requestJson(
      config,
      `/v1/agents/${agentId}`,
      {
        json: body,
        method: "PUT",
      },
      agentResponseSchema
    );

  return {
    async create(body) {
      return await requestJson(
        config,
        "/v1/agents",
        {
          json: body,
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
          query: {
            userId: options.userId,
            workspaceId: options.workspaceId,
          },
        },
        agentsResponseSchema
      );
    },
    async get(agentId) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}`,
        {},
        agentResponseSchema
      );
    },
    async disable(agentId) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/disable`,
        { method: "POST" },
        agentResponseSchema
      );
    },
    async enable(agentId) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/enable`,
        { method: "POST" },
        agentResponseSchema
      );
    },
    getVersion,
    async listVersions(agentId, options = {}) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/versions`,
        { query: { cursor: options.cursor, limit: options.limit } },
        agentVersionsResponseSchema
      );
    },
    async listMcpAttachments(agentId) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/mcp-attachments`,
        {},
        mcpAttachmentsResponseSchema
      );
    },
    async restoreVersion(agentId, versionNumber) {
      const version = await getVersion(agentId, versionNumber);
      return update(agentId, {
        name: version.name,
        model: version.model,
        thinkingLevel: version.thinkingLevel,
        providerId: version.providerId,
        memoryInjectionEnabled: version.memoryInjectionEnabled,
        tools: version.tools,
        instructions: version.instructions,
        metadata: version.metadata,
        mcpConnectionIds: version.mcpConnectionIds,
      });
    },
    update,
    async updateMcpAttachment(agentId, mcpConnectionId, body) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/mcp-attachments/${mcpConnectionId}`,
        { json: body, method: "PATCH" },
        mcpAttachmentResponseSchema
      );
    },
    async delete(agentId, includeArtifacts) {
      await requestJson<void>(config, `/v1/agents/${agentId}`, {
        method: "DELETE",
        query: { includeArtifacts },
      });
    },
    async uploadAvatar(agentId, file) {
      const form = new FormData();
      form.append("file", file);
      return await requestJson(
        config,
        `/v1/agents/${agentId}/avatar`,
        {
          body: form,
          method: "POST",
        },
        agentResponseSchema
      );
    },
    async removeAvatar(agentId) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/avatar`,
        { method: "DELETE" },
        agentResponseSchema
      );
    },
  };
}
