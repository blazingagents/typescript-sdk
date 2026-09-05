import type { BlazingAgentsFetch } from "../types.ts";

/**
 * Reusable mocked-fetch fixtures for the SDK unit tests. The SDK takes a
 * `fetch` override in its constructor options, so tests inject a
 * `vi.fn`-backed stub here instead of patching `globalThis.fetch`.
 */

export interface FetchCall {
  init?: RequestInit;
  url: string;
}

export interface MockFetchOptions {
  // The JSON body to return for non-streaming responses.
  body?: unknown;
  // The response headers.
  headers?: Record<string, string>;
  // The status code to return for non-streaming responses.
  status?: number;
  /**
   * A streaming body (ReadableStream<Uint8Array>) — used by the
   * generation endpoints.
   */
  stream?: ReadableStream<Uint8Array>;
  // The raw text body (overrides `body` if set).
  text?: string;
}

export function createMockFetch(options: MockFetchOptions = {}): {
  fetch: BlazingAgentsFetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  // biome-ignore lint/suspicious/useAwait: mock fetch is synchronous but must return a Promise
  const fetch: BlazingAgentsFetch = async (url, init) => {
    calls.push({ url, init });
    const status = options.status ?? 200;
    const headers = new Headers(options.headers ?? {});
    if (options.stream) {
      headers.set("content-type", "text/event-stream");
      return new Response(options.stream, { status, headers });
    }
    if (options.text !== undefined) {
      if (!headers.has("content-type")) {
        headers.set("content-type", "text/plain");
      }
      /**
       * 204 No Content must not carry a body — the Response constructor
       * throws otherwise. Drop the body for 204 regardless of `text`.
       */
      return new Response(status === 204 ? null : options.text, {
        status,
        headers,
      });
    }
    headers.set("content-type", "application/json");
    // 204 No Content must not carry a body.
    if (status === 204) {
      return new Response(null, { status, headers });
    }
    return new Response(JSON.stringify(options.body ?? null), {
      status,
      headers,
    });
  };
  return { fetch, calls };
}

/**
 * Builds a SSE byte stream from a list of chunk objects (each serialized
 * as `data: ${json}\n\n`, terminated by `data: [DONE]\n\n`).
 */
export function sseStream(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// Builds a plain-text byte stream (for stateless generation).
export function textStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

// The wire error envelope shape.
export function errorEnvelope(
  code: string,
  message: string,
  options: {
    details?: Record<string, unknown>;
    param?: string;
  } = {}
): string {
  return JSON.stringify({
    error: {
      code,
      ...(options.details ? { details: options.details } : {}),
      message,
      ...(options.param === undefined ? {} : { param: options.param }),
    },
  });
}

// A minimal agent wire-shape row (matches `agentResponseSchema`).
export function agentRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: "ag_0123456789abcdef",
    tenantId: "ten_0123456789abcdef",
    name: "Test Agent",
    model: "openrouter/test-model",
    providerId: "prv_0123456789abcdef",
    thinkingLevel: null,
    workspaceId: "ws_0123456789abcdef",
    memoryInjectionEnabled: false,
    tools: ["workspace"],
    instructions: "Be helpful.",
    userId: "",
    metadata: {},
    mcpConnectionIds: [],
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    status: "active",
    ...overrides,
  };
}
