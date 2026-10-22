import {
  type ChatConnection,
  type ChatConnectionsResponse,
  type CreateChatConnectionBody,
  chatConnectionSchema,
  chatConnectionsResponseSchema,
  type RotateChatConnectionBody,
  type UpdateChatConnectionBody,
} from "../contracts/entities/chat-connections.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface ChatConnectionsResource {
  /**
   * Checks the Chat Connection health.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  checkHealth(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Creates the Chat Connection.
   * @param input - creation fields; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateChatConnectionBody & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Deletes the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Disables the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  disable(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Enables the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  enable(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Retrieves the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Lists available Chat Connection records.
   * @param input - optional abortSignal.
   * @returns The chat connections response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ResourceRequestOptions): Promise<ChatConnectionsResponse>;
  /**
   * Replaces the Chat Connection credentials.
   * @param input - `chatConnectionId`; fields to change; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  rotateCredentials(
    input: RotateChatConnectionBody & {
      chatConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Updates the Chat Connection.
   * @param input - `chatConnectionId`; fields to change; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateChatConnectionBody & {
      chatConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<ChatConnection>;
}

/**
 * Builds the Chat Connections operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createChatConnectionsResource(
  config: HttpConfig
): ChatConnectionsResource {
  return {
    async list({ abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/chat-connections",
        { credentialBearing: true, signal: abortSignal },
        chatConnectionsResponseSchema
      );
    },
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/chat-connections",
        {
          credentialBearing: true,
          signal: abortSignal,
          method: "POST",
          json: body,
        },
        chatConnectionSchema
      );
    },
    async get({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}`,
        { credentialBearing: true, signal: abortSignal, method: "GET" },
        chatConnectionSchema
      );
    },
    async update({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}`,
        {
          credentialBearing: true,
          signal: abortSignal,
          method: "PATCH",
          json: body,
        },
        chatConnectionSchema
      );
    },
    async rotateCredentials({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/credentials`,
        {
          credentialBearing: true,
          signal: abortSignal,
          method: "POST",
          json: body,
        },
        chatConnectionSchema
      );
    },
    async checkHealth({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/health`,
        { credentialBearing: true, signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async enable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/enable`,
        { credentialBearing: true, signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async disable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/disable`,
        { credentialBearing: true, signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async delete({ chatConnectionId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}`,
        { credentialBearing: true, signal: abortSignal, method: "DELETE" }
      );
    },
  };
}
