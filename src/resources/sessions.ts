import {
  latestSessionsListResponseSchema,
  sessionMessagesResponseSchema,
  sessionsListResponseSchema,
  toolApprovalDecisionResponseSchema,
  toolApprovalsResponseSchema,
} from "../contracts/entities/sessions.ts";
import { buildTerminalStreamResult } from "../generation.ts";
import { requestJson, requestStream } from "../http.ts";
import type { HttpConfig, SessionsResource } from "../types.ts";

/**
 * `client.sessions` — list/get-messages/delete over
 * `/v1/agents/:agentId/sessions`. Pagination is manual: the SDK returns
 * the page as-is (`{ data, nextCursor }` verbatim); the caller passes
 * `nextCursor` back as `cursor` on the next call.
 */

export function createSessionsResource(config: HttpConfig): SessionsResource {
  return {
    async decideToolApproval({
      agentId,
      sessionId,
      approvalId,
      abortSignal,
      ...decision
    }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals/${approvalId}`,
        {
          json: decision,
          method: "POST",
          signal: abortSignal,
        },
        toolApprovalDecisionResponseSchema
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
    async joinToolApprovalContinuation({
      agentId,
      sessionId,
      continuationId,
      abortSignal,
    }) {
      const response = await requestStream(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approval-continuations/${continuationId}`,
        { signal: abortSignal }
      );
      return buildTerminalStreamResult(response, "continuation");
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
