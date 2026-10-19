import {
  type SessionUsageQuery,
  type SessionUsageResponse,
  sessionUsageResponseSchema,
  type UsageOverviewQuery,
  type UsageOverviewResponse,
  type UsageQuery,
  type UsageResponse,
  usageOverviewResponseSchemaForQuery,
  usageResponseSchema,
} from "../contracts/entities/usage.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface UsageResource {
  /**
   * Retrieves usage totals.
   * @param input - query filters; optional abortSignal.
   * @returns The usage response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input?: Partial<UsageQuery> & ResourceRequestOptions
  ): Promise<UsageResponse>;
  /**
   * Retrieves usage for one Agent.
   * @param input - `agentId`; query filters; optional abortSignal.
   * @returns The usage response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getForAgent(
    input: Partial<UsageQuery> & { agentId: string } & ResourceRequestOptions
  ): Promise<UsageResponse>;
  /**
   * Returns totals, daily usage, and bounded Agent, user, and model rankings.
   * @param input - query filters; optional abortSignal.
   * @returns The usage overview response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  overview(
    input?: Partial<UsageOverviewQuery> & ResourceRequestOptions
  ): Promise<UsageOverviewResponse>;
  /**
   * Retrieves usage grouped by Session.
   * @param input - query filters; optional abortSignal.
   * @returns The session usage response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  sessions(
    input: SessionUsageQuery & ResourceRequestOptions
  ): Promise<SessionUsageResponse>;
}

/**
 * `client.usage` — get over `/v1/usage` (tenant-wide) and
 * `/v1/agents/:agentId/usage` (per-agent). The query shape is `UsageQuery`;
 * the SDK passes it through as query params.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createUsageResource(config: HttpConfig): UsageResource {
  return {
    async sessions({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/usage/sessions",
        {
          method: "POST",
          json: body,
          signal: abortSignal,
        },
        sessionUsageResponseSchema
      );
    },
    async get({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/usage",
        {
          query,
          signal: abortSignal,
        },
        usageResponseSchema
      );
    },
    async getForAgent({ agentId, abortSignal, ...query }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/usage`,
        { query, signal: abortSignal },
        usageResponseSchema
      );
    },
    async overview({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/usage/overview",
        { query, signal: abortSignal },
        usageOverviewResponseSchemaForQuery(query)
      );
    },
  };
}
