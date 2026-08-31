import {
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
    async decideToolApproval(
      agentId,
      sessionId,
      approvalId,
      decision,
      options = {}
    ) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals/${approvalId}`,
        {
          json: decision,
          method: "POST",
          ...(options.signal ? { signal: options.signal } : {}),
        },
        toolApprovalDecisionResponseSchema
      );
    },
    async list(agentId, options = {}) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions`,
        {
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
    async messages(agentId, sessionId, options = {}) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/messages`,
        {
          query: {
            cursor: options.cursor,
            after: options.after,
            limit: options.limit,
          },
        },
        sessionMessagesResponseSchema
      );
    },
    async joinToolApprovalContinuation(
      agentId,
      sessionId,
      continuationId,
      options = {}
    ) {
      const response = await requestStream(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approval-continuations/${continuationId}`,
        options.signal ? { signal: options.signal } : {}
      );
      return buildTerminalStreamResult(response, "continuation");
    },
    async toolApprovals(agentId, sessionId) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals`,
        {},
        toolApprovalsResponseSchema
      );
    },
    async delete(agentId, sessionId, deleteArtifacts) {
      await requestJson<void>(
        config,
        `/v1/agents/${agentId}/sessions/${sessionId}`,
        { method: "DELETE", query: { deleteArtifacts } }
      );
    },
  };
}
