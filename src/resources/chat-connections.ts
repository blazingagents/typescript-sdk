import {
  chatConnectionSchema,
  chatConnectionsResponseSchema,
} from "../contracts/entities/chat-connections.ts";
import { requestJson } from "../http.ts";
import type { ChatConnectionsResource, HttpConfig } from "../types.ts";

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
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}`,
        { signal: abortSignal, method: "GET" },
        chatConnectionSchema
      );
    },
    async update({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}`,
        { signal: abortSignal, method: "PATCH", json: body },
        chatConnectionSchema
      );
    },
    async rotateCredentials({ chatConnectionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/credentials`,
        { signal: abortSignal, method: "POST", json: body },
        chatConnectionSchema
      );
    },
    async checkHealth({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/health`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async enable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/enable`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async disable({ chatConnectionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}/disable`,
        { signal: abortSignal, method: "POST" },
        chatConnectionSchema
      );
    },
    async delete({ chatConnectionId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/chat-connections/${encodeURIComponent(chatConnectionId)}`,
        { signal: abortSignal, method: "DELETE" }
      );
    },
  };
}
