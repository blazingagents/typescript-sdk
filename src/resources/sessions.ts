import {
  sessionInputResponseSchema,
  sessionInputsResponseSchema,
  stopSessionResponseSchema,
} from "../contracts/entities/session-inputs.ts";
import {
  latestSessionsListResponseSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsListResponseSchema,
  toolApprovalsResponseSchema,
} from "../contracts/entities/sessions.ts";
import {
  agentIdSchema,
  sessionIdSchema,
  turnIdSchema,
} from "../contracts/ids.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, SessionsResource } from "../types.ts";

/**
 * `client.sessions` reads, paginates, and deletes Sessions under
 * `/v1/agents/:agentId/sessions`. Pagination is manual: the SDK returns
 * the page as-is (`{ data, nextCursor }` verbatim); the caller passes
 * `nextCursor` back as `cursor` on the next call.
 */

export function createSessionsResource(config: HttpConfig): SessionsResource {
  return {
    async submitInput({ agentId, sessionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${agentIdSchema.parse(agentId)}/sessions/${sessionIdSchema.parse(sessionId)}/inputs`,
        { method: "POST", json: body, signal: abortSignal },
        sessionInputResponseSchema
      );
    },
    async inputs({ agentId, sessionId, abortSignal, ...query }) {
      return await requestJson(
        config,
        `/v1/agents/${agentIdSchema.parse(agentId)}/sessions/${sessionIdSchema.parse(sessionId)}/inputs`,
        { query, signal: abortSignal },
        sessionInputsResponseSchema
      );
    },
    async stop({ agentId, sessionId, turnId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentIdSchema.parse(agentId)}/sessions/${sessionIdSchema.parse(sessionId)}/stop`,
        {
          method: "POST",
          json: { turnId: turnIdSchema.parse(turnId) },
          signal: abortSignal,
        },
        stopSessionResponseSchema
      );
    },
    async get({ agentId, sessionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}`,
        { signal: abortSignal },
        sessionResponseSchema
      );
    },
    async list({ agentId, ...options }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions`,
        {
          signal: options.abortSignal,
          query: {
            cursor: options.cursor,
            limit: options.limit,
            // Stryker disable next-line ConditionalExpression: URL serialization omits an undefined query value.
            ...(options.userId === undefined ? {} : { userId: options.userId }),
          },
        },
        sessionsListResponseSchema
      );
    },
    async listLatest(options = {}) {
      return await requestJson(
        config,
        "/v1/sessions/latest",
        {
          signal: options.abortSignal,
          query: {
            cursor: options.cursor,
            limit: options.limit,
            // Stryker disable next-line ConditionalExpression: URL serialization omits an undefined query value.
            ...(options.userId === undefined ? {} : { userId: options.userId }),
            ...(options.byAgent === undefined
              ? {}
              : { byAgent: options.byAgent }),
          },
        },
        latestSessionsListResponseSchema
      );
    },
    async messages({ agentId, sessionId, ...options }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/messages`,
        {
          signal: options.abortSignal,
          query: {
            cursor: options.cursor,
            after: options.after,
            limit: options.limit,
          },
        },
        sessionMessagesResponseSchema
      );
    },
    async toolApprovals({ agentId, sessionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals`,
        { signal: abortSignal },
        toolApprovalsResponseSchema
      );
    },
    async delete({ agentId, sessionId, deleteArtifacts, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}`,
        { method: "DELETE", query: { deleteArtifacts }, signal: abortSignal }
      );
    },
  };
}
