import {
  type CreateMcpConnectionBody,
  type McpConnectionReconnectResult,
  type McpConnectionResponse,
  type McpConnectionsResponse,
  type McpConnectionTestResponse,
  mcpConnectionReconnectResultSchema,
  mcpConnectionResponseSchema,
  mcpConnectionsResponseSchema,
  mcpConnectionTestResponseSchema,
  type ReconnectMcpConnectionBody,
  type UpdateMcpConnectionBody,
} from "../contracts/entities/mcp-connections.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface McpConnectionsResource {
  /**
   * Creates the MCP Connection.
   * @param input - creation fields; optional abortSignal.
   * @returns The mcp connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateMcpConnectionBody & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
  /**
   * Deletes the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retrieves the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns The mcp connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
  /**
   * Lists available MCP Connection records.
   * @param input - optional abortSignal.
   * @returns The mcp connections response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ResourceRequestOptions): Promise<McpConnectionsResponse>;
  /**
   * Reconnects the MCP Connection.
   * @param input - `mcpConnectionId`; fields to change; optional abortSignal.
   * @returns The mcp connection reconnect result.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  reconnect(
    input: ReconnectMcpConnectionBody & {
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpConnectionReconnectResult>;
  /**
   * Tests the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns The mcp connection test response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  test(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionTestResponse>;
  /**
   * Updates the MCP Connection.
   * @param input - `mcpConnectionId`; fields to change; optional abortSignal.
   * @returns The mcp connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateMcpConnectionBody & {
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
}

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
        credentialBearing: true,
        signal: abortSignal,
        method: "POST",
      },
      mcpConnectionResponseSchema
    )) as McpConnectionsResource["create"];
  return {
    create,
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/mcp-connections",
        { credentialBearing: true, signal: abortSignal },
        mcpConnectionsResponseSchema
      );
    },
    async get({ mcpConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/mcp-connections/${mcpConnectionId}`,
        { credentialBearing: true, signal: abortSignal },
        mcpConnectionResponseSchema
      );
    },
    async update({ mcpConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/mcp-connections/${mcpConnectionId}`,
        {
          json: body,
          credentialBearing: true,
          signal: abortSignal,
          method: "PATCH",
        },
        mcpConnectionResponseSchema
      );
    },
    async delete({ mcpConnectionId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/mcp-connections/${mcpConnectionId}`,
        {
          method: "DELETE",
          credentialBearing: true,
          signal: abortSignal,
        }
      );
    },
    async test({ mcpConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/mcp-connections/${mcpConnectionId}/test`,
        { method: "POST", credentialBearing: true, signal: abortSignal },
        mcpConnectionTestResponseSchema
      );
    },
    async reconnect({ mcpConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/mcp-connections/${mcpConnectionId}/reconnect`,
        {
          json: body,
          credentialBearing: true,
          signal: abortSignal,
          method: "POST",
        },
        mcpConnectionReconnectResultSchema
      );
    },
  };
}
