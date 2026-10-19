import {
  type ChatConnection,
  type ChatConnectionsResponse,
  type ChatDeliveryList,
  type ChatDeliveryResult,
  type CreateChatConnectionBody,
  chatConnectionSchema,
  chatConnectionsResponseSchema,
  chatDeliveryListSchema,
  chatDeliveryResultSchema,
  type RepairChatDeliveryBody,
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
   * Lists one page of the replies and approval cards the Chat Connection has
   * sent or tried to send, newest first, in every status. Pass `nextCursor`
   * as `cursor` to fetch older records.
   * @param input - `chatConnectionId`; optional `cursor`, `limit` (1 to 100, default 100), and abortSignal.
   * @returns The page of chat deliveries.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listDeliveries(
    input: {
      chatConnectionId: string;
      cursor?: string;
      limit?: number;
    } & ResourceRequestOptions
  ): Promise<ChatDeliveryList>;
  /**
   * Sends a stuck reply or approval card again, without running a turn or
   * tool. Use it when the previous send stopped before its outcome was known.
   * Pass the delivery's current `attempt` as `expectedAttempt`; the repair is
   * refused if it has changed. `previousSenderStopped` and
   * `acceptDuplicateRisk` must be `true`: the message can appear twice. The
   * connection must be enabled. Check `status` in the result, because a
   * successful request does not by itself mean the message was delivered.
   * @param input - `chatConnectionId`, `deliveryId`, the repair confirmations, and optional abortSignal.
   * @returns The delivery outcome.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  repairDelivery(
    input: RepairChatDeliveryBody & {
      chatConnectionId: string;
      deliveryId: string;
    } & ResourceRequestOptions
  ): Promise<ChatDeliveryResult>;
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
        { signal: abortSignal },
        chatConnectionsResponseSchema
      );
    },
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/chat-connections",
        { signal: abortSignal, method: "POST", json: body },
        chatConnectionSchema
      );
    },
    async get({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}`,
        { signal: abortSignal, method: "GET" },
        chatConnectionSchema
      );
    },
    async update({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}`,
        { signal: abortSignal, method: "PATCH", json: body },
        chatConnectionSchema
      );
    },
    async rotateCredentials({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/credentials`,
        { signal: abortSignal, method: "POST", json: body },
        chatConnectionSchema
      );
    },
    async checkHealth({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/health`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async listDeliveries({ chatConnectionId, abortSignal, ...query }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/deliveries`,
        { signal: abortSignal, query },
        chatDeliveryListSchema
      );
    },
    async repairDelivery({
      chatConnectionId,
      deliveryId,
      abortSignal,
      ...body
    }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/deliveries/${deliveryId}/repair`,
        { signal: abortSignal, method: "POST", json: body },
        chatDeliveryResultSchema
      );
    },
    async enable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/enable`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async disable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}/disable`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async delete({ chatConnectionId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/chat-connections/${chatConnectionId}`,
        { signal: abortSignal, method: "DELETE" }
      );
    },
  };
}
