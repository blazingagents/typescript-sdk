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

/**
 * Builds the Mcp Connections operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createMcpConnectionsResource(
  config: HttpConfig
): McpConnectionsResource {
  const create = (async ({
    abortSignal,
    ...body
  }: Parameters<McpConnectionsResource["create"]>[0]) =>
    requestJson(
      config,
      "/v1/mcp-connections",
      {
        json: body,
        signal: abortSignal,
        method: "POST",
      },
      mcpConnectionResponseSchema
    )) as McpConnectionsResource["create"];
  return {
    /**
     * Starts OAuth authorization for mcp connections.
     */
    async connect({ mcpConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${mcpConnectionId}/connect`,
        { method: "POST", signal: abortSignal },
        mcpConnectionOauthConnectResponseSchema
      );
    },
    create,
    /**
     * Lists one page of mcp connections.
     */
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/mcp-connections",
        { signal: abortSignal },
        mcpConnectionsResponseSchema
      );
    },
    /**
     * Retrieves mcp connections.
     */
    async get({ mcpConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${mcpConnectionId}`,
        { signal: abortSignal },
        mcpConnectionResponseSchema
      );
    },
    /**
     * Updates mcp connections.
     */
    async update({ mcpConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${mcpConnectionId}`,
        {
          json: updateMcpConnectionBodySchema.parse(body),
          signal: abortSignal,
          method: "PATCH",
        },
        mcpConnectionResponseSchema
      );
    },
    /**
     * Deletes mcp connections.
     */
    async delete({ mcpConnectionId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/mcp-connections/${mcpConnectionId}`,
        {
          method: "DELETE",
          signal: abortSignal,
        }
      );
    },
    /**
     * Tests mcp connections.
     */
    async test({ mcpConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${mcpConnectionId}/test`,
        { method: "POST", signal: abortSignal },
        mcpConnectionTestResponseSchema
      );
    },
    /**
     * Reconnects mcp connections.
     */
    async reconnect({ mcpConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/mcp-connections/${mcpConnectionId}/reconnect`,
        {
          json: reconnectMcpConnectionBodySchema.parse(body),
          signal: abortSignal,
          method: "POST",
        },
        mcpConnectionReconnectResultSchema
      );
    },
  };
}
