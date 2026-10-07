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
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createSessionsResource(config: HttpConfig): SessionsResource {
  return {
    /**
     * Submits a Session input. Reuse the request ID and payload after an uncertain acknowledgement.
     */
    async submitInput({ agentId, sessionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${agentIdSchema.parse(agentId)}/sessions/${sessionIdSchema.parse(sessionId)}/inputs`,
        { method: "POST", json: body, signal: abortSignal },
        sessionInputResponseSchema
      );
    },
    /**
     * Lists input receipts. Poll the first page to observe state changes.
     */
    async inputs({ agentId, sessionId, abortSignal, ...query }) {
      return await requestJson(
        config,
        `/v1/agents/${agentIdSchema.parse(agentId)}/sessions/${sessionIdSchema.parse(sessionId)}/inputs`,
        { query, signal: abortSignal },
        sessionInputsResponseSchema
      );
    },
    /**
     * Records cancellation for the named Turn without waiting for settlement.
     */
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
    /**
     * Forks a Session at a message. Reuse the idempotency key after an uncertain acknowledgement.
     */
    async fork({ agentId, sessionId, messageId, idempotencyKey, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentIdSchema.parse(agentId)}/sessions/${sessionIdSchema.parse(sessionId)}/fork`,
        {
          method: "POST",
          json: { messageId },
          headers: { "Idempotency-Key": idempotencyKey },
          signal: abortSignal,
        },
        sessionResponseSchema
      );
    },
    /**
     * Retrieves sessions.
     */
    async get({ agentId, sessionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}`,
        { signal: abortSignal },
        sessionResponseSchema
      );
    },
    /**
     * Lists one page of sessions.
     */
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
    /**
     * Lists recently updated Sessions, optionally limited to one per Agent.
     */
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
    /**
     * Lists one page of Session messages.
     */
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
    /**
     * Retrieves the pending Tool approval round.
     */
    async toolApprovals({ agentId, sessionId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals`,
        { signal: abortSignal },
        toolApprovalsResponseSchema
      );
    },
    /**
     * Deletes sessions.
     */
    async delete({ agentId, sessionId, deleteArtifacts, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}`,
        { method: "DELETE", query: { deleteArtifacts }, signal: abortSignal }
      );
    },
  };
}
