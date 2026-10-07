import {
  sessionUsageQuerySchema,
  sessionUsageResponseSchema,
  usageOverviewResponseSchemaForQuery,
  usageResponseSchema,
} from "../contracts/entities/usage.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, UsageResource } from "../types.ts";

/**
 * `client.usage` — get over `/v1/usage` (tenant-wide) and
 * `/v1/agents/:agentId/usage` (per-agent). The query shape is the core
 * `usageQuerySchema`; the SDK passes it through as query params.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createUsageResource(config: HttpConfig): UsageResource {
  return {
    /**
     * Retrieves usage grouped by Session.
     */
    async sessions({ abortSignal, ...input }) {
      const body = sessionUsageQuerySchema.parse(input);
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
    /**
     * Retrieves usage.
     */
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
    /**
     * Retrieves usage for one Agent.
     */
    async getForAgent({ agentId, abortSignal, ...query }) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/usage`,
        { query, signal: abortSignal },
        usageResponseSchema
      );
    },
    /**
     * Retrieves usage totals, daily usage, and bounded rankings.
     */
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
