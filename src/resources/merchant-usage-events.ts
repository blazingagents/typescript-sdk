import {
  type MerchantUsageEventResponse,
  type MerchantUsageEventStatus,
  type MerchantUsageEventsResponse,
  type MerchantUsageSummaryResponse,
  merchantUsageEventResponseSchema,
  merchantUsageEventsResponseSchema,
  merchantUsageSummaryResponseSchema,
} from "../contracts/entities/merchant.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface MerchantUsageEventsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  status?: MerchantUsageEventStatus;
}

/**
 * `client.merchantUsageEvents` — the immutable delivery ledger behind
 * `/v1/merchant-usage-events`. `retry` and `discard` are the
 * operator actions on unresolved events.
 */
export interface MerchantUsageEventsResource {
  /**
   * Discards the merchant usage event.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  discard(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Retrieves the merchant usage event.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Lists one page of merchant usage event records.
   * @param input - filters and pagination options.
   * @returns The merchant usage events response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input?: MerchantUsageEventsListOptions
  ): Promise<MerchantUsageEventsResponse>;
  /**
   * Sends a `failed` event, or a `pending` event whose automatic delivery gave up, to the provider again. Retrying is safe: the provider drops duplicates by the event ID.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  retry(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Retrieves merchant usage delivery totals for the selected day range.
   * @param input - Lookback window in `days` and optional abortSignal.
   * @returns The merchant usage summary response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  summary(
    input?: { days?: number } & ResourceRequestOptions
  ): Promise<MerchantUsageSummaryResponse>;
}

/**
 * `client.merchantUsageEvents` — the immutable usage-event ledger over
 * `/v1/merchant-usage-events`, plus the delivery-health `summary` aggregate
 * and the per-event operator actions `retry` and `discard`.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
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
        apiPath`/v1/merchant-usage-events/${eventId}`,
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
        apiPath`/v1/merchant-usage-events/${eventId}/retry`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
    async discard({ eventId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/merchant-usage-events/${eventId}/discard`,
        { method: "POST", signal: abortSignal },
        merchantUsageEventResponseSchema
      );
    },
  };
}
