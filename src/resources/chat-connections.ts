import {
  chatConnectionSchema,
  chatConnectionsResponseSchema,
} from "../contracts/entities/chat-connections.ts";
import { requestJson } from "../http.ts";
import type { ChatConnectionsResource, HttpConfig } from "../types.ts";

/**
 * Builds the Chat Connections operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createChatConnectionsResource(
  config: HttpConfig
): ChatConnectionsResource {
  return {
    /**
     * Lists one page of chat connections.
     */
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/chat-connections",
        { signal: abortSignal },
        chatConnectionsResponseSchema
      );
    },
    /**
     * Creates chat connections.
     */
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/chat-connections",
        { signal: abortSignal, method: "POST", json: body },
        chatConnectionSchema
      );
    },
    /**
     * Retrieves chat connections.
     */
    async get({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}`,
        { signal: abortSignal, method: "GET" },
        chatConnectionSchema
      );
    },
    /**
     * Updates chat connections.
     */
    async update({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}`,
        { signal: abortSignal, method: "PATCH", json: body },
        chatConnectionSchema
      );
    },
    /**
     * Replaces the Chat Connection credentials.
     */
    async rotateCredentials({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/credentials`,
        { signal: abortSignal, method: "POST", json: body },
        chatConnectionSchema
      );
    },
    /**
     * Checks the Chat Connection health.
     */
    async checkHealth({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/health`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    /**
     * Enables chat connections.
     */
    async enable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/enable`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    /**
     * Disables chat connections.
     */
    async disable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/disable`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    /**
     * Deletes chat connections.
     */
    async delete({ chatConnectionId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}`,
        { signal: abortSignal, method: "DELETE" }
      );
    },
  };
}
