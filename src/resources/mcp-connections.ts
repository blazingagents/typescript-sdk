import {
  mcpConnectionOauthConnectResponseSchema,
  mcpConnectionReconnectResultSchema,
  mcpConnectionResponseSchema,
  mcpConnectionsResponseSchema,
  mcpConnectionTestResponseSchema,
  reconnectMcpConnectionBodySchema,
  updateMcpConnectionBodySchema,
} from "../contracts/entities/mcp-connections.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, McpConnectionsResource } from "../types.ts";

export function createMcpConnectionsResource(
  config: HttpConfig
): McpConnectionsResource {
  const create = (async (
    body: Parameters<McpConnectionsResource["create"]>[0]
  ) =>
    requestJson(
      config,
      "/v1/mcp-connections",
      {
        json: body,
        method: "POST",
      },
      mcpConnectionResponseSchema
    )) as McpConnectionsResource["create"];
  return {
    async connect(id) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${id}/connect`,
        { method: "POST" },
        mcpConnectionOauthConnectResponseSchema
      );
    },
    create,
    async list() {
      return await requestJson(
        config,
        "/v1/mcp-connections",
        {},
        mcpConnectionsResponseSchema
      );
    },
    async get(id) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${id}`,
        {},
        mcpConnectionResponseSchema
      );
    },
    async update(id, body) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${id}`,
        {
          json: updateMcpConnectionBodySchema.parse(body),
          method: "PATCH",
        },
        mcpConnectionResponseSchema
      );
    },
    async delete(id) {
      await requestJson<void>(config, `/v1/mcp-connections/${id}`, {
        method: "DELETE",
      });
    },
    async test(id) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${id}/test`,
        { method: "POST" },
        mcpConnectionTestResponseSchema
      );
    },
    async reconnect(id, body) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${id}/reconnect`,
        {
          json: reconnectMcpConnectionBodySchema.parse(body),
          method: "POST",
        },
        mcpConnectionReconnectResultSchema
      );
    },
  };
}
