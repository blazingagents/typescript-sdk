import type { UIMessage } from "ai";
import {
  type SessionInputResponse,
  type SessionInputsQuery,
  type SessionInputsResponse,
  type StopSessionBody,
  type StopSessionResponse,
  type SubmitSessionInputBody,
  sessionInputResponseSchema,
  sessionInputsResponseSchema,
  stopSessionResponseSchema,
} from "../contracts/entities/session-inputs.ts";
import {
  type LatestSessionsListResponse,
  latestSessionsListResponseSchema,
  type SessionMessagesResponse,
  type SessionResponse,
  type SessionsListResponse,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsListResponseSchema,
  type ToolApprovalsResponse,
  toolApprovalsResponseSchema,
} from "../contracts/entities/sessions.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface SessionsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface LatestSessionsListOptions extends ResourceRequestOptions {
  byAgent?: boolean;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface SessionMessagesOptions extends ResourceRequestOptions {
  after?: string;
  cursor?: string;
  limit?: number;
}

export interface SessionsResource {
  /**
   * Deletes the Session.
   * @param input - `agentId`, `sessionId`; optional abortSignal; deleteArtifacts controls Artifact deletion.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: {
      agentId: string;
      sessionId: string;
      deleteArtifacts: boolean;
    } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retry a lost acknowledgement with the same explicit idempotencyKey.
   * @param input - `agentId`, `sessionId`, `messageId`; optional abortSignal.
   * @returns The session response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  fork(
    input: {
      agentId: string;
      sessionId: string;
      messageId: string;
      idempotencyKey: string;
    } & ResourceRequestOptions
  ): Promise<SessionResponse>;
  /**
   * Retrieves the Session.
   * @param input - `agentId`, `sessionId`; optional abortSignal.
   * @returns The session response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<SessionResponse>;
  /**
   * Poll from the first page for state changes; cursor only paginates receipts.
   * @param input - `agentId`, `sessionId`; query filters; optional abortSignal.
   * @returns The session inputs response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  inputs(
    input: { agentId: string; sessionId: string } & SessionInputsQuery &
      ResourceRequestOptions
  ): Promise<SessionInputsResponse>;
  /**
   * Lists one page of Session records.
   * @param input - `agentId`; filters and pagination options.
   * @returns The sessions list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input: { agentId: string } & SessionsListOptions
  ): Promise<SessionsListResponse>;
  /**
   * `GET /v1/sessions/latest` — the Tenant's most recently updated Sessions,
   * newest first. Set `byAgent` to return at most one Session per Agent.
   * `userId` narrows the candidate Sessions to one end user's.
   * @param input - filters and pagination options.
   * @returns The latest sessions list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listLatest(
    input?: LatestSessionsListOptions
  ): Promise<LatestSessionsListResponse>;
  /**
   * Lists one page of Session messages.
   * @param input - `agentId`, `sessionId`.
   * @returns The session messages response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  messages(
    input: { agentId: string; sessionId: string } & SessionMessagesOptions
  ): Promise<SessionMessagesResponse>;
  /**
   * Records cancellation for the named Turn without waiting for settlement.
   * @param input - `agentId`, `sessionId`; fields to change; optional abortSignal.
   * @returns The stop session response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  stop(
    input: { agentId: string; sessionId: string } & StopSessionBody &
      ResourceRequestOptions
  ): Promise<StopSessionResponse>;
  /**
   * Retry a lost acknowledgement with the same requestId and payload.
   * @param input - `agentId`, `sessionId`; fields to change; optional abortSignal.
   * @returns The session input response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  submitInput(
    input: Omit<SubmitSessionInputBody, "message"> & {
      agentId: string;
      sessionId: string;
      message: UIMessage;
    } & ResourceRequestOptions
  ): Promise<SessionInputResponse>;
  /**
   * Retrieves the pending Tool approval round.
   * @param input - `agentId`, `sessionId`; optional abortSignal.
   * @returns The tool approvals response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  toolApprovals(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<ToolApprovalsResponse>;
}

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
    async submitInput({ agentId, sessionId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}/inputs`,
        { method: "POST", json: body, signal: abortSignal },
        sessionInputResponseSchema
      );
    },
    async inputs({ agentId, sessionId, abortSignal, ...query }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}/inputs`,
        { query, signal: abortSignal },
        sessionInputsResponseSchema
      );
    },
    async stop({ agentId, sessionId, turnId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}/stop`,
        {
          method: "POST",
          json: { turnId },
          signal: abortSignal,
        },
        stopSessionResponseSchema
      );
    },
    async fork({ agentId, sessionId, messageId, idempotencyKey, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}/fork`,
        {
          method: "POST",
          json: { messageId },
          headers: { "Idempotency-Key": idempotencyKey },
          signal: abortSignal,
        },
        sessionResponseSchema
      );
    },
    async get({ agentId, sessionId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}`,
        { signal: abortSignal },
        sessionResponseSchema
      );
    },
    async list({ agentId, ...options }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions`,
        {
          signal: options.abortSignal,
          query: {
            cursor: options.cursor,
            limit: options.limit,
            userId: options.userId,
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
            userId: options.userId,
            byAgent: options.byAgent,
          },
        },
        latestSessionsListResponseSchema
      );
    },
    async messages({ agentId, sessionId, ...options }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}/messages`,
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
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals`,
        { signal: abortSignal },
        toolApprovalsResponseSchema
      );
    },
    async delete({ agentId, sessionId, deleteArtifacts, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/agents/${agentId}/sessions/${sessionId}`,
        { method: "DELETE", query: { deleteArtifacts }, signal: abortSignal }
      );
    },
  };
}
