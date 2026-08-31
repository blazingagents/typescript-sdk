import { describe, expect, it, vi } from "vitest";
import { BlazingAgentsError } from "./errors.ts";
import { parseErrorEnvelope, requestJson, requestStream } from "./http.ts";
import { errorEnvelope } from "./test/fixtures.ts";
import type { HttpConfig } from "./types.ts";

const DIAGNOSTIC_BODY_LIMIT_BYTES = 64 * 1024;
const INVALID_RESPONSE_MESSAGE = "The server returned an invalid response.";

function config(fetch: HttpConfig["fetch"]): HttpConfig {
  return { apiKey: "ba_test", baseUrl: "http://localhost:8787", fetch };
}

/**
 * Casts a fetch mock's call tuple to `[string, RequestInit | undefined]`
 * so destructuring doesn't trip over `vi.fn`'s zero-arg inference.
 */
function callArgs(
  fetch: ReturnType<typeof vi.fn>,
  index: number
): [string, RequestInit | undefined] {
  return fetch.mock.calls[index] as unknown as [
    string,
    RequestInit | undefined,
  ];
}

describe("requestJson", () => {
  it("sends authorization and parses JSON on success", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const result = await requestJson<{ ok: boolean }>(
      config(fetch),
      "/v1/agents"
    );

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = callArgs(fetch, 0);
    expect(url).toBe("http://localhost:8787/v1/agents");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer ba_test",
    });
  });

  it("sends JSON and caller-provided headers", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await requestJson(config(fetch), "/v1/agents", {
      headers: { "x-request-id": "request-1" },
      json: { name: "Builder" },
      method: "POST",
    });

    const [, init] = callArgs(fetch, 0) as [string, RequestInit];
    expect(init).toMatchObject({
      body: JSON.stringify({ name: "Builder" }),
      method: "POST",
    });
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-request-id": "request-1",
    });
  });

  it("appends scalar query params and skips nullish values", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await requestJson(config(fetch), "/v1/agents", {
      query: { cursor: "abc", gone: null, limit: 50, skip: undefined },
    });

    const [url] = callArgs(fetch, 0);
    expect(url).toBe("http://localhost:8787/v1/agents?cursor=abc&limit=50");
  });

  it("omits an empty query string", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await requestJson(config(fetch), "/v1/agents", {
      query: { cursor: undefined },
    });

    expect(callArgs(fetch, 0)[0]).toBe("http://localhost:8787/v1/agents");
  });

  it("uses globalThis.fetch when no custom fetch is provided", async () => {
    const original = globalThis.fetch;
    const stub = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = stub as unknown as typeof globalThis.fetch;
    try {
      await requestJson(
        { apiKey: "ba_test", baseUrl: "http://localhost:8787" },
        "/x"
      );
      expect(stub).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("forwards the abort signal", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 200 })
    );
    const controller = new AbortController();
    await requestJson(config(fetch), "/x", { signal: controller.signal });
    expect(callArgs(fetch, 0)[1]?.signal).toBe(controller.signal);
  });

  it("returns undefined for a 204 response", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(
      requestJson<void>(config(fetch), "/v1/agents/x", { method: "DELETE" })
    ).resolves.toBeUndefined();
  });

  it("rejects a 204 response when the expected schema requires a body", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const schema = {
      parse: () => {
        throw new Error("body required");
      },
    };

    await expect(
      requestJson(config(fetch), "/v1/providers/x", {}, schema)
    ).rejects.toMatchObject({
      code: "invalid_response",
      responseBody: "",
      status: 204,
    });
  });

  it("does not impose the diagnostic limit on valid successful JSON", async () => {
    const value = "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES + 1);
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ value }), { status: 200 })
    );
    await expect(requestJson(config(fetch), "/x")).resolves.toEqual({ value });
  });

  it("preserves the complete known API error and HTTP context", async () => {
    const response = new Response(
      errorEnvelope(
        "agent_name_conflict",
        "An Agent with this name already exists.",
        {
          details: { conflictingResourceId: "ag_0123456789abcdef" },
          param: "/name",
        }
      ),
      {
        headers: {
          "retry-after": "30",
          "x-request-id": "request-response",
        },
        status: 409,
      }
    );
    const fetch = vi.fn(async () => response);
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      code: "agent_name_conflict",
      details: { conflictingResourceId: "ag_0123456789abcdef" },
      message: "An Agent with this name already exists.",
      param: "/name",
      requestId: "request-response",
      status: 409,
    });
    expect(error.headers).not.toBe(response.headers);
    expect(error.headers?.get("retry-after")).toBe("30");
    expect(error.headers?.get("x-request-id")).toBe("request-response");
    response.headers.set("retry-after", "60");
    expect(error.headers?.get("retry-after")).toBe("30");
    expect(error.responseBody).toBeUndefined();
  });

  it("accepts future API codes and fields without body request-ID precedence", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "future_server_outcome",
              details: { recovery: "refresh" },
              futureErrorField: true,
              message: "A newer server outcome.",
              param: "/version",
              requestId: "request-body",
            },
            futureEnvelopeField: "accepted",
            requestId: "request-envelope",
          }),
          {
            headers: { "x-request-id": "request-header" },
            status: 422,
          }
        )
    );
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      code: "future_server_outcome",
      details: { recovery: "refresh" },
      message: "A newer server outcome.",
      param: "/version",
      requestId: "request-header",
      status: 422,
    });
    expect(error.responseBody).toBeUndefined();
  });

  it.each([409, 413, 415, 503])(
    "classifies a malformed %i response as invalid_response",
    async (status) => {
      const fetch = vi.fn(
        async () =>
          new Response("upstream failure", {
            headers: { "x-request-id": `request-${status}` },
            status,
          })
      );
      const error = (await requestJson(config(fetch), "/x").catch(
        (caught) => caught
      )) as BlazingAgentsError;

      expect(error).toMatchObject({
        code: "invalid_response",
        message: INVALID_RESPONSE_MESSAGE,
        requestId: `request-${status}`,
        responseBody: "upstream failure",
        status,
      });
    }
  );

  it.each([
    ["", 502],
    ["<html>Bad gateway</html>", 503],
  ])("retains a non-envelope diagnostic body %#", async (body, status) => {
    const fetch = vi.fn(async () => new Response(body, { status }));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      code: "invalid_response",
      message: INVALID_RESPONSE_MESSAGE,
      responseBody: body,
      status,
    });
    expect(error.responseBodyTruncated).toBeUndefined();
  });

  it("retains an exact 64 KiB diagnostic body", async () => {
    const body = "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES);
    const fetch = vi.fn(async () => new Response(body, { status: 500 }));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error.responseBody).toBe(body);
    expect(error.responseBodyTruncated).toBeUndefined();
  });

  it("bounds oversized diagnostic bodies and cancels the reader", async () => {
    let canceled = false;
    let sent = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel() {
          canceled = true;
        },
        pull(controller) {
          if (sent) {
            controller.close();
            return;
          }
          sent = true;
          controller.enqueue(
            new TextEncoder().encode(
              `prefix-${"x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES)}`
            )
          );
        },
      },
      { highWaterMark: 0 }
    );
    const fetch = vi.fn(async () => new Response(stream, { status: 500 }));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(new TextEncoder().encode(error.responseBody).byteLength).toBe(
      DIAGNOSTIC_BODY_LIMIT_BYTES
    );
    expect(error.responseBody).toBe(
      `prefix-${"x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES - 7)}`
    );
    expect(error.responseBodyTruncated).toBe(true);
    expect(canceled).toBe(true);
  });

  it("bounds diagnostics at a complete UTF-8 prefix", async () => {
    const body = `${"x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES - 1)}é`;
    const fetch = vi.fn(async () => new Response(body, { status: 500 }));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error.responseBody).toBe(
      "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES - 1)
    );
    expect(
      new TextEncoder().encode(error.responseBody).byteLength
    ).toBeLessThanOrEqual(DIAGNOSTIC_BODY_LIMIT_BYTES);
    expect(error.responseBodyTruncated).toBe(true);
  });

  it("bounds diagnostics containing invalid UTF-8 bytes", async () => {
    const body = new Uint8Array(DIAGNOSTIC_BODY_LIMIT_BYTES);
    body.fill(0xff);
    const fetch = vi.fn(async () => new Response(body, { status: 500 }));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(
      new TextEncoder().encode(error.responseBody).byteLength
    ).toBeLessThanOrEqual(DIAGNOSTIC_BODY_LIMIT_BYTES);
    expect(error.responseBodyTruncated).toBe(true);
  });

  it("normalizes a response-body read failure with HTTP context", async () => {
    const cause = new Error("body read failed");
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (pullCount === 0) {
            pullCount += 1;
            controller.enqueue(new TextEncoder().encode("partial body"));
            return;
          }
          controller.error(cause);
        },
      },
      { highWaterMark: 0 }
    );
    const fetch = vi.fn(
      async () =>
        new Response(stream, {
          headers: { "x-request-id": "request-read-failure" },
          status: 500,
        })
    );
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      cause,
      code: "invalid_response",
      requestId: "request-read-failure",
      responseBody: "partial body",
      responseBodyTruncated: true,
      status: 500,
    });
  });

  it("normalizes a successful response-body read failure", async () => {
    const cause = new Error("success body read failed");
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount === 0) {
          pullCount += 1;
          controller.enqueue(
            new TextEncoder().encode("x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES))
          );
          return;
        }
        if (pullCount === 1) {
          pullCount += 1;
          controller.enqueue(new TextEncoder().encode("extra"));
          return;
        }
        controller.error(cause);
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(stream, {
          headers: { "x-request-id": "request-success-read-failure" },
          status: 200,
        })
    );
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      cause,
      code: "invalid_response",
      requestId: "request-success-read-failure",
      responseBody: "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES),
      responseBodyTruncated: true,
      status: 200,
    });
  });

  it.each([200, 500])(
    "classifies a caller abort while reading a %i response body",
    async (status) => {
      const cause = new Error("body read aborted");
      cause.name = "AbortError";
      const controller = new AbortController();
      controller.abort(cause);
      const stream = new ReadableStream<Uint8Array>({
        pull(streamController) {
          streamController.error(cause);
        },
      });
      const fetch = vi.fn(
        async () =>
          new Response(stream, {
            headers: { "x-request-id": "request-after-headers" },
            status,
          })
      );

      const error = (await requestJson(config(fetch), "/x", {
        signal: controller.signal,
      }).catch((caught) => caught)) as BlazingAgentsError;

      expect(error).toMatchObject({ cause, code: "request_aborted" });
      expect(error.headers).toBeUndefined();
      expect(error.requestId).toBeUndefined();
      expect(error.status).toBeUndefined();
    }
  );

  it("normalizes a locked response body", async () => {
    const response = new Response(new ReadableStream<Uint8Array>(), {
      status: 500,
    });
    const reader = response.body?.getReader();
    const fetch = vi.fn(async () => response);
    try {
      const error = (await requestJson(config(fetch), "/x").catch(
        (caught) => caught
      )) as BlazingAgentsError;

      expect(error).toMatchObject({
        code: "invalid_response",
        responseBody: "",
        responseBodyTruncated: true,
        status: 500,
      });
      expect(error.cause).toBeInstanceOf(TypeError);
    } finally {
      await reader?.cancel();
    }
  });

  it("preserves cancellation failure while bounding the body", async () => {
    const cause = new Error("reader cancellation failed");
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel() {
          throw cause;
        },
        pull(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              pullCount === 0 ? "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES) : "y"
            )
          );
          pullCount += 1;
        },
      },
      { highWaterMark: 0 }
    );
    const fetch = vi.fn(async () => new Response(stream, { status: 500 }));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      cause,
      code: "invalid_response",
      responseBody: "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES),
      responseBodyTruncated: true,
      status: 500,
    });
  });

  it.each(["not JSON", ""])(
    "normalizes malformed successful JSON %#",
    async (body) => {
      const fetch = vi.fn(
        async () =>
          new Response(body, {
            headers: { "x-request-id": "request-success" },
            status: 200,
          })
      );
      const error = (await requestJson(config(fetch), "/x").catch(
        (caught) => caught
      )) as BlazingAgentsError;

      expect(error).toMatchObject({
        code: "invalid_response",
        message: INVALID_RESPONSE_MESSAGE,
        requestId: "request-success",
        responseBody: body,
        status: 200,
      });
    }
  );

  it("bounds malformed successful JSON diagnostics", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES + 1), {
          status: 200,
        })
    );
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      code: "invalid_response",
      responseBody: "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES),
      responseBodyTruncated: true,
      status: 200,
    });
  });

  it("throws network_error with the original cause when fetch throws", async () => {
    const cause = new Error("connection refused");
    const fetch = vi.fn(() => Promise.reject(cause));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      cause,
      code: "network_error",
      message: "connection refused",
    });
    expect(error.status).toBeUndefined();
  });

  it("uses a stable network message for a non-Error cause", async () => {
    const fetch = vi.fn(() =>
      Promise.reject("string error" as unknown as Error)
    );
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({
      cause: "string error",
      code: "network_error",
      message: "Network request failed (fetch threw before any HTTP exchange).",
    });
  });

  it("throws request_aborted for a standard AbortError", async () => {
    const cause = new Error("aborted");
    cause.name = "AbortError";
    const fetch = vi.fn(() => Promise.reject(cause));
    const error = (await requestJson(config(fetch), "/x").catch(
      (caught) => caught
    )) as BlazingAgentsError;

    expect(error).toMatchObject({ cause, code: "request_aborted" });
  });

  it("throws request_aborted when the caller signal is aborted", async () => {
    const cause = "custom abort reason";
    const fetch = vi.fn(() => Promise.reject(cause as unknown as Error));
    const controller = new AbortController();
    controller.abort(cause);
    const error = (await requestJson(config(fetch), "/x", {
      signal: controller.signal,
    }).catch((caught) => caught)) as BlazingAgentsError;

    expect(error).toMatchObject({ cause, code: "request_aborted" });
  });

  it("does not attach request or credential configuration", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("offline")));
    const error = (await requestJson(
      {
        apiKey: "ba_super_secret",
        baseUrl: "https://secret.example",
        fetch,
      },
      "/v1/private",
      {
        headers: { "x-private": "private-header" },
        json: { password: "private-body" },
        method: "POST",
      }
    ).catch((caught) => caught)) as BlazingAgentsError;

    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain("ba_super_secret");
    expect(serialized).not.toContain("private-header");
    expect(serialized).not.toContain("private-body");
    expect(serialized).not.toContain("secret.example");
  });

  it.each([0, 300])("rejects non-2xx boundary status %i", async (status) => {
    const fetch = vi.fn(async () =>
      status === 0 ? Response.error() : new Response("redirect", { status })
    );
    await expect(requestJson(config(fetch), "/x")).rejects.toBeInstanceOf(
      BlazingAgentsError
    );
  });
});

describe("parseErrorEnvelope", () => {
  it("supports direct decoding without supplied HTTP headers", () => {
    const error = parseErrorEnvelope(
      errorEnvelope("invalid_request", "Bad request."),
      400
    );

    expect(error).toMatchObject({
      code: "invalid_request",
      message: "Bad request.",
      status: 400,
    });
    expect(Array.from(error.headers?.entries() ?? [])).toEqual([]);
  });
});

describe("requestStream", () => {
  it("returns the raw Response on 2xx", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        })
    );
    const response = await requestStream(config(fetch), "/v1/agents/x/chat", {
      json: { message: {} },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("preserves a non-2xx API envelope and request ID", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(errorEnvelope("unauthorized", "bad key"), {
          headers: { "x-request-id": "request-stream-error" },
          status: 401,
        })
    );

    await expect(requestStream(config(fetch), "/x")).rejects.toMatchObject({
      code: "unauthorized",
      requestId: "request-stream-error",
      status: 401,
    });
  });

  it("shares invalid-response diagnostics with JSON requests", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("gateway", {
          headers: { "x-request-id": "request-stream-invalid" },
          status: 503,
        })
    );

    await expect(requestStream(config(fetch), "/x")).rejects.toMatchObject({
      code: "invalid_response",
      message: INVALID_RESPONSE_MESSAGE,
      requestId: "request-stream-invalid",
      responseBody: "gateway",
      status: 503,
    });
  });

  it.each([0, 300])("rejects non-2xx boundary status %i", async (status) => {
    const fetch = vi.fn(async () =>
      status === 0 ? Response.error() : new Response("redirect", { status })
    );
    await expect(requestStream(config(fetch), "/x")).rejects.toBeInstanceOf(
      BlazingAgentsError
    );
  });
});

describe("response observation", () => {
  it.each([
    ["success", 200, JSON.stringify({ ok: true })],
    ["API error", 400, errorEnvelope("invalid_request", "Bad request.")],
    ["malformed response", 200, "not-json"],
  ])("observes a received %s before decoding", async (_name, status, body) => {
    const onResponse = vi.fn();
    const fetch = vi.fn(
      async () =>
        new Response(body, {
          headers: { "x-request-id": "req_0123456789abcdef" },
          status,
        })
    );
    const promise = requestJson(
      {
        ...config(fetch),
        onResponse,
      },
      "/v1/items",
      { clientRequestId: "tenant-attempt-1", method: "POST" }
    );
    await promise.catch(() => undefined);

    expect(onResponse).toHaveBeenCalledOnce();
    expect(onResponse).toHaveBeenCalledWith({
      clientRequestId: "tenant-attempt-1",
      durationMs: expect.any(Number),
      method: "POST",
      path: "/v1/items",
      requestId: "req_0123456789abcdef",
      status,
    });
    const [, init] = callArgs(fetch, 0);
    expect(init?.headers).toMatchObject({
      "x-client-request-id": "tenant-attempt-1",
    });
  });

  it("observes a streaming handshake without taking body ownership", async () => {
    const onResponse = vi.fn();
    const response = await requestStream(
      {
        ...config(
          vi.fn(
            async () =>
              new Response("stream", {
                headers: { "x-request-id": "req_0123456789abcdef" },
              })
          )
        ),
        onResponse,
      },
      "/v1/stream"
    );

    expect(onResponse).toHaveBeenCalledOnce();
    await expect(response.text()).resolves.toBe("stream");
  });

  it("contains hook failures for successful and error responses", async () => {
    const onResponse = vi.fn(() => {
      throw new Error("hook failed");
    });
    const success = config(vi.fn(async () => Response.json({ ok: true })));
    await expect(
      requestJson({ ...success, onResponse }, "/v1/success")
    ).resolves.toEqual({ ok: true });

    const failure = config(
      vi.fn(
        async () =>
          new Response(errorEnvelope("invalid_request", "bad"), {
            status: 400,
          })
      )
    );
    await expect(
      requestJson({ ...failure, onResponse }, "/v1/failure")
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it.each([
    ["transport failure", new TypeError("offline"), undefined],
    ["abort", new DOMException("aborted", "AbortError"), new AbortController()],
  ])(
    "does not observe %s without a response",
    async (_name, error, controller) => {
      const onResponse = vi.fn();
      controller?.abort();
      await expect(
        requestJson(
          {
            ...config(vi.fn(() => Promise.reject(error))),
            onResponse,
          },
          "/v1/items",
          controller ? { signal: controller.signal } : {}
        )
      ).rejects.toBeInstanceOf(BlazingAgentsError);
      expect(onResponse).not.toHaveBeenCalled();
    }
  );
});
