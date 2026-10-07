import { chatDeliveriesResponseSchema } from "../contracts/entities/chat-connections.ts";
import { requestJson } from "../http.ts";
import type { ChatDeliveriesResource, HttpConfig } from "../types.ts";

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
    /**
     * Lists one page of chat deliveries.
     */
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
