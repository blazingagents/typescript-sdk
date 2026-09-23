import {
  merchantUsageEventResponseSchema,
  merchantUsageEventsResponseSchema,
  merchantUsageSummaryResponseSchema,
} from "../contracts/entities/merchant.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, MerchantUsageEventsResource } from "../types.ts";

/**
 * `client.merchantUsageEvents` — the immutable usage-event ledger over
 * `/v1/merchant-usage-events`, plus the delivery-health `summary` aggregate
 * and the per-event operator actions `retry`/`release`/`discard`.
 */
export function createMerchantUsageEventsResource(
  config: HttpConfig
): MerchantUsageEventsResource {
  return {
    async list({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-usage-events",
        { query, signal: abortSignal },
        merchantUsageEventsResponseSchema
      );
    },
    async get({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}`,
        { signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    async summary({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-usage-events/summary",
        { query, signal: abortSignal },
        merchantUsageSummaryResponseSchema
      );
    },
    async retry({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}/retry`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    async release({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}/release`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    async discard({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}/discard`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
  };
}
