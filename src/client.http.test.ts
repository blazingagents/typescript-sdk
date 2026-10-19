import { afterEach, describe, expect, it, vi } from "vitest";
import { BlazingAgentsError } from "./errors.ts";
import { BlazingAgents, type BlazingAgentsOptions } from "./index.ts";
import { agentRow, errorEnvelope, type FetchOption } from "./test/fixtures.ts";

const BASE = "http://localhost:8787";
const DIAGNOSTIC_BODY_LIMIT_BYTES = 64 * 1024;
const INVALID_RESPONSE_MESSAGE =
  "[invalid_response] The server returned an invalid response.";
const emptyPage = JSON.stringify({ data: [], nextCursor: null });

function client(
  fetch: FetchOption,
  options: Partial<BlazingAgentsOptions> = {}
) {
  return new BlazingAgents({
    apiKey: "ba_test",
    baseUrl: BASE,
    fetch,
    ...options,
  });
}

/** Lists Agents and returns the error the call rejected with. */
async function listFailure(
  fetch: FetchOption,
  options: Partial<BlazingAgentsOptions> = {}
): Promise<BlazingAgentsError> {
  const error: unknown = await client(fetch, options)
    .agents.list()
    .catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(BlazingAgentsError);
  return error as BlazingAgentsError;
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

afterEach(() => vi.unstubAllGlobals());

describe("client requests", () => {
  it("sends the bearer token and parses the JSON body", async () => {
    const fetch = vi.fn(async () => new Response(emptyPage, { status: 200 }));
    const result = await client(fetch).agents.list();

    expect(result).toEqual({ data: [], nextCursor: null });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = callArgs(fetch, 0);
    expect(url).toBe("http://localhost:8787/v1/agents");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer ba_test",
    });
  });

  it("sends JSON bodies with the JSON content type", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify(agentRow()), { status: 201 })
    );
    await client(fetch).agents.create({ name: "Builder" });

    const [, init] = callArgs(fetch, 0);
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toMatchObject({ name: "Builder" });
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
    });
  });

  it("appends scalar query params and skips undefined values", async () => {
    const fetch = vi.fn(async () => new Response(emptyPage, { status: 200 }));
    await client(fetch).agents.list({
      cursor: "abc",
      limit: 50,
      userId: undefined,
    });

    expect(callArgs(fetch, 0)[0]).toBe(
      "http://localhost:8787/v1/agents?cursor=abc&limit=50"
    );
  });

  it("uses globalThis.fetch when no custom fetch is provided", async () => {
    const stub = vi.fn(async () => new Response(emptyPage, { status: 200 }));
    vi.stubGlobal("fetch", stub);

    await new BlazingAgents({ apiKey: "ba_test" }).agents.list();

    expect(stub).toHaveBeenCalledOnce();
  });

  it("ignores the body of a 2xx acknowledgement on a no-content request", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await expect(
      client(fetch).agents.delete({
        agentId: "ag_0123456789abcdef",
        includeArtifacts: false,
      })
    ).resolves.toBeUndefined();
    expect(callArgs(fetch, 0)[1]).toMatchObject({ method: "DELETE" });
  });

  it("rejects a 204 response when the resource needs a body", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(
      client(fetch).providers.get({ providerId: "prv_0123456789abcdef" })
    ).rejects.toMatchObject({
      code: "invalid_response",
      responseBody: "",
      status: 204,
    });
  });

  it("does not impose the diagnostic limit on valid successful JSON", async () => {
    const text = "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES + 1);
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "m1",
                role: "assistant",
                branchable: true,
                parts: [{ type: "text", text }],
              },
            ],
            nextCursor: null,
            latestCursor: "1",
          }),
          { status: 200 }
        )
    );
    const page = await client(fetch).sessions.messages({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
    });

    expect(page.data[0]?.parts).toEqual([{ type: "text", text }]);
  });

  it("rejects non-2xx boundary statuses on JSON and streaming requests", async () => {
    for (const status of [0, 300]) {
      const fetch = vi.fn(async () =>
        status === 0 ? Response.error() : new Response("redirect", { status })
      );
      await expect(client(fetch).agents.list()).rejects.toBeInstanceOf(
        BlazingAgentsError
      );
      await expect(
        client(fetch).completion({
          agentId: "ag_0123456789abcdef",
          prompt: "hi",
        })
      ).rejects.toBeInstanceOf(BlazingAgentsError);
    }
  });
});

describe("API error decoding", () => {
  it("renders the API error code before the message for catalog lookup", async () => {
    const error = await listFailure(
      vi.fn(
        async () =>
          new Response(
            errorEnvelope(
              "model_validation_unavailable",
              "Provider model discovery is unavailable"
            ),
            { status: 503 }
          )
      )
    );

    expect(error.message).toBe(
      "[model_validation_unavailable] Provider model discovery is unavailable"
    );
    expect(String(error)).toBe(
      "BlazingAgentsError: [model_validation_unavailable] Provider model discovery is unavailable"
    );
    expect(error.code).toBe("model_validation_unavailable");
  });

  it("preserves the complete known API error and HTTP context", async () => {
    const response = new Response(
      errorEnvelope(
        "provider_name_conflict",
        "A Provider with this name already exists.",
        {
          details: { conflictingResourceId: "prv_0123456789abcdef" },
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
    const error = await listFailure(vi.fn(async () => response));

    expect(error).toMatchObject({
      code: "provider_name_conflict",
      details: { conflictingResourceId: "prv_0123456789abcdef" },
      message:
        "[provider_name_conflict] A Provider with this name already exists.",
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

  it("keeps Retry-After and retryAfterSeconds on session_turn_unresponsive", async () => {
    const error = await listFailure(
      vi.fn(
        async () =>
          new Response(
            errorEnvelope(
              "session_turn_unresponsive",
              "The previous turn in this session stopped responding.",
              { details: { retryAfterSeconds: 23 } }
            ),
            { headers: { "retry-after": "23" }, status: 409 }
          )
      )
    );

    expect(error).toMatchObject({
      code: "session_turn_unresponsive",
      details: { retryAfterSeconds: 23 },
      status: 409,
    });
    expect(error.headers?.get("retry-after")).toBe("23");
  });

  it("accepts future API codes and fields without body request-ID precedence", async () => {
    const error = await listFailure(
      vi.fn(
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
      )
    );

    expect(error).toMatchObject({
      code: "future_server_outcome",
      details: { recovery: "refresh" },
      message: "[future_server_outcome] A newer server outcome.",
      param: "/version",
      requestId: "request-header",
      status: 422,
    });
    expect(error.responseBody).toBeUndefined();
  });

  it("preserves a non-2xx envelope and request id on streaming requests", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(errorEnvelope("unauthorized", "bad key"), {
          headers: { "x-request-id": "request-stream-error" },
          status: 401,
        })
    );

    await expect(
      client(fetch).completion({ agentId: "ag_0123456789abcdef", prompt: "hi" })
    ).rejects.toMatchObject({
      code: "unauthorized",
      requestId: "request-stream-error",
      status: 401,
    });
  });

  it("does not attach request or credential configuration", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("offline")));
    const error: unknown = await client(fetch, {
      apiKey: "ba_super_secret",
      baseUrl: "https://secret.example",
    })
      .withOptions({ clientRequestId: "private-header" })
      .agents.create({ name: "private-body" })
      .catch((caught: unknown) => caught);

    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain("ba_super_secret");
    expect(serialized).not.toContain("private-header");
    expect(serialized).not.toContain("private-body");
    expect(serialized).not.toContain("secret.example");
  });
});

describe("invalid response diagnostics", () => {
  it.each([409, 413, 415, 503])(
    "classifies a malformed %i response as invalid_response",
    async (status) => {
      const error = await listFailure(
        vi.fn(
          async () =>
            new Response("upstream failure", {
              headers: { "x-request-id": `request-${status}` },
              status,
            })
        )
      );

      expect(error).toMatchObject({
        code: "invalid_response",
        message: INVALID_RESPONSE_MESSAGE,
        requestId: `request-${status}`,
        responseBody: "upstream failure",
        status,
      });
    }
  );

  it("shares invalid-response diagnostics with streaming requests", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("gateway", {
          headers: { "x-request-id": "request-stream-invalid" },
          status: 503,
        })
    );

    await expect(
      client(fetch).completion({ agentId: "ag_0123456789abcdef", prompt: "hi" })
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: INVALID_RESPONSE_MESSAGE,
      requestId: "request-stream-invalid",
      responseBody: "gateway",
      status: 503,
    });
  });

  it.each([
    ["", 502],
    ["<html>Bad gateway</html>", 503],
  ])("retains a non-envelope diagnostic body %#", async (body, status) => {
    const error = await listFailure(
      vi.fn(async () => new Response(body, { status }))
    );

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
    const error = await listFailure(
      vi.fn(async () => new Response(body, { status: 500 }))
    );

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
    const error = await listFailure(
      vi.fn(async () => new Response(stream, { status: 500 }))
    );

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
    const error = await listFailure(
      vi.fn(async () => new Response(body, { status: 500 }))
    );

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
    const error = await listFailure(
      vi.fn(async () => new Response(body, { status: 500 }))
    );

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
    const error = await listFailure(
      vi.fn(
        async () =>
          new Response(stream, {
            headers: { "x-request-id": "request-read-failure" },
            status: 500,
          })
      )
    );

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
    const error = await listFailure(
      vi.fn(
        async () =>
          new Response(stream, {
            headers: { "x-request-id": "request-success-read-failure" },
            status: 200,
          })
      )
    );

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

      const error: unknown = await client(fetch)
        .agents.list({ abortSignal: controller.signal })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BlazingAgentsError);
      expect(error).toMatchObject({ cause, code: "request_aborted" });
      expect(error).toMatchObject({
        headers: undefined,
        requestId: undefined,
        status: undefined,
      });
    }
  );

  it("normalizes a locked response body", async () => {
    const response = new Response(new ReadableStream<Uint8Array>(), {
      status: 500,
    });
    const reader = response.body?.getReader();
    try {
      const error = await listFailure(vi.fn(async () => response));

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
    const error = await listFailure(
      vi.fn(async () => new Response(stream, { status: 500 }))
    );

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
      const error = await listFailure(
        vi.fn(
          async () =>
            new Response(body, {
              headers: { "x-request-id": "request-success" },
              status: 200,
            })
        )
      );

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
    const error = await listFailure(
      vi.fn(
        async () =>
          new Response("x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES + 1), {
            status: 200,
          })
      )
    );

    expect(error).toMatchObject({
      code: "invalid_response",
      responseBody: "x".repeat(DIAGNOSTIC_BODY_LIMIT_BYTES),
      responseBodyTruncated: true,
      status: 200,
    });
  });
});

describe("credential echo", () => {
  it("discards a credential-bearing response that echoes a nested credential", async () => {
    const body = JSON.stringify({
      data: [{ id: "prv_1", config: { headers: [{ bearerToken: "sk-1" }] } }],
    });
    const fetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "x-request-id": "req_echo" },
        })
    );
    const error: unknown = await client(fetch)
      .providers.list()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BlazingAgentsError);
    expect(error).toMatchObject({
      code: "credential_echo",
      details: { field: "bearerToken" },
      requestId: "req_echo",
      responseBody: undefined,
      status: 200,
    });
    expect(String((error as Error).message)).not.toContain("sk-1");
  });

  it("returns a credential field from an operation the contract does not flag", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: [], nextCursor: null, apiKey: 1 })
    );

    await expect(client(fetch).agents.list()).resolves.toMatchObject({
      data: [],
    });
  });
});

describe("transport failures", () => {
  it("throws network_error with the original cause when fetch throws", async () => {
    const cause = new Error("connection refused");
    const error = await listFailure(vi.fn(() => Promise.reject(cause)));

    expect(error).toMatchObject({
      cause,
      code: "network_error",
      message: "[network_error] connection refused",
    });
    expect(error.status).toBeUndefined();
  });

  it("uses a stable network message for a non-Error cause", async () => {
    const error = await listFailure(
      vi.fn(() => Promise.reject("string error" as unknown as Error))
    );

    expect(error).toMatchObject({
      cause: "string error",
      code: "network_error",
      message:
        "[network_error] Network request failed (fetch threw before any HTTP exchange).",
    });
  });

  it("throws request_aborted for a standard AbortError", async () => {
    const cause = new Error("aborted");
    cause.name = "AbortError";
    const error = await listFailure(vi.fn(() => Promise.reject(cause)));

    expect(error).toMatchObject({ cause, code: "request_aborted" });
  });

  it("throws request_aborted when the caller signal is aborted", async () => {
    const cause = "custom abort reason";
    const fetch = vi.fn(() => Promise.reject(cause as unknown as Error));
    const controller = new AbortController();
    controller.abort(cause);
    const error: unknown = await client(fetch)
      .agents.list({ abortSignal: controller.signal })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BlazingAgentsError);
    expect(error).toMatchObject({ cause, code: "request_aborted" });
  });
});

describe("response observation", () => {
  it.each([
    ["success", 200, emptyPage],
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
    await client(fetch, { onResponse })
      .withOptions({ clientRequestId: "tenant-attempt-1" })
      .agents.list()
      .catch(() => undefined);

    expect(onResponse).toHaveBeenCalledOnce();
    expect(onResponse).toHaveBeenCalledWith({
      clientRequestId: "tenant-attempt-1",
      durationMs: expect.any(Number),
      method: "GET",
      path: "/v1/agents",
      requestId: "req_0123456789abcdef",
      status,
    });
  });

  it("observes a streaming handshake without taking body ownership", async () => {
    const onResponse = vi.fn();
    const fetch = vi.fn(
      async () =>
        new Response("stream", {
          headers: { "x-request-id": "req_0123456789abcdef" },
        })
    );
    const result = await client(fetch, { onResponse }).completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });

    expect(onResponse).toHaveBeenCalledOnce();
    await expect(result.text).resolves.toBe("stream");
  });

  it("contains hook failures for successful and error responses", async () => {
    const onResponse = vi.fn(() => {
      throw new Error("hook failed");
    });
    await expect(
      client(
        vi.fn(async () => new Response(emptyPage, { status: 200 })),
        { onResponse }
      ).agents.list()
    ).resolves.toEqual({ data: [], nextCursor: null });

    await expect(
      client(
        vi.fn(
          async () =>
            new Response(errorEnvelope("invalid_request", "bad"), {
              status: 400,
            })
        ),
        { onResponse }
      ).agents.list()
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
        client(
          vi.fn(() => Promise.reject(error)),
          { onResponse }
        ).agents.list(controller ? { abortSignal: controller.signal } : {})
      ).rejects.toBeInstanceOf(BlazingAgentsError);
      expect(onResponse).not.toHaveBeenCalled();
    }
  );
});
