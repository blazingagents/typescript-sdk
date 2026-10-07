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
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createMerchantUsageEventsResource(
  config: HttpConfig
): MerchantUsageEventsResource {
  return {
    /**
     * Lists one page of merchant usage events.
     */
    async list({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-usage-events",
        { query, signal: abortSignal },
        merchantUsageEventsResponseSchema
      );
    },
    /**
     * Retrieves merchant usage events.
     */
    async get({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}`,
        { signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    /**
     * Retrieves merchant usage delivery totals for the selected day range.
     */
    async summary({ abortSignal, ...query } = {}) {
      return await requestJson(
        config,
        "/v1/merchant-usage-events/summary",
        { query, signal: abortSignal },
        merchantUsageSummaryResponseSchema
      );
    },
    /**
     * Retries delivery of merchant usage events.
     */
    async retry({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}/retry`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    /**
     * Releases merchant usage events.
     */
    async release({ eventId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/merchant-usage-events/${encodeURIComponent(eventId)}/release`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    /**
     * Discards merchant usage events.
     */
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
