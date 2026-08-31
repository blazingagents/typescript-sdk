import { usageResponseSchema } from "../contracts/entities/usage.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, UsageResource } from "../types.ts";

/**
 * `client.usage` — get over `/v1/usage` (tenant-wide) and
 * `/v1/agents/:agentId/usage` (per-agent). The query shape is the core
 * `usageQuerySchema`; the SDK passes it through as query params.
 */

export function createUsageResource(config: HttpConfig): UsageResource {
  return {
    async get(query = {}) {
      return await requestJson(
        config,
        "/v1/usage",
        {
          query,
        },
        usageResponseSchema
      );
    },
    async getForAgent(agentId, query = {}) {
      return await requestJson(
        config,
        `/v1/agents/${agentId}/usage`,
        { query },
        usageResponseSchema
      );
    },
  };
}
