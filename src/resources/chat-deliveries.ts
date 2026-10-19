import {
  type ChatDeliveriesResponse,
  type ChatDeliveryListStatus,
  chatDeliveriesResponseSchema,
} from "../contracts/entities/chat-connections.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface ChatDeliveriesListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  /** ISO 8601 date-time; inclusive lower bound on `createdAt`. */
  since?: string;
  /** `failed` and/or `ambiguous`; omitted means both. */
  status?: readonly ChatDeliveryListStatus[];
}

/**
 * `client.chatDeliveries` — the Tenant's deliveries across all Chat
 * Connections behind `GET /v1/chat-deliveries`, newest first.
 */
export interface ChatDeliveriesResource {
  /**
   * Lists one page of Chat delivery records.
   * @param input - filters and pagination options.
   * @returns The chat deliveries response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ChatDeliveriesListOptions): Promise<ChatDeliveriesResponse>;
}

/**
 * `client.chatDeliveries` — `GET /v1/chat-deliveries`, the Tenant-wide
 * delivery feed across all Chat Connections, newest first.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createChatDeliveriesResource(
  config: HttpConfig
): ChatDeliveriesResource {
  return {
    async list({ abortSignal, status, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/chat-deliveries",
        {
          query: {
            ...query,
            // Multi-value filters serialize as one comma-separated parameter.
            status: status?.length ? status.join(",") : undefined,
          },
          signal: abortSignal,
        },
        chatDeliveriesResponseSchema
      );
    },
  };
}
