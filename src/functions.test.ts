import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BlazingAgents } from "./client.ts";
import { BlazingAgentsError } from "./errors.ts";
import { type ChatFunctions, defineFunction } from "./functions.ts";
import type { BlazingAgentsFetch } from "./types.ts";

const BASE = "http://localhost:8787";
const agentId = "ag_0123456789abcdef";
const sessionId = "ss_0123456789abcdef";
const callId = "fc_0123456789abcdef";
const callPath = `/v1/agents/${agentId}/sessions/${sessionId}/function-calls/${callId}`;
const message = { id: "m1", role: "user" as const, parts: [] };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Call {
  body: unknown;
  headers: Headers;
  method: string;
  path: string;
  signal?: AbortSignal | null;
}

function sse(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function readyEvent(
  overrides: Partial<{
    deadlineAt: string;
    id: string;
    input: unknown;
    name: string;
  }> = {}
) {
  return {
    type: "data-ba-function-call",
    data: {
      id: callId,
      name: "getOrder",
      input: { orderId: "o1" },
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    },
    transient: true,
  };
}

function upstream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel,
  });
  return {
    cancel,
    stream,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    error: (reason: unknown) => controller.error(reason),
  };
}

type Responder = (call: Call) => Response | Promise<Response>;

const ok = (body: unknown) => Response.json(body);
const status = (code: number) =>
  Response.json(
    { error: { code: "function_call_conflict", message: "Conflict" } },
    { status: code }
  );

function harness(
  stream: ReadableStream<Uint8Array>,
  responders: {
    claim?: readonly Responder[];
    result?: readonly Responder[];
    other?: Responder;
  } = {}
) {
  const calls: Call[] = [];
  const claim = [...(responders.claim ?? [])];
  const result = [...(responders.result ?? [])];
  // biome-ignore lint/suspicious/useAwait: mock fetch returns a Promise
  const fetch: BlazingAgentsFetch = async (url, init = {}) => {
    const path = url.slice(BASE.length);
    const call: Call = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: new Headers(init.headers as HeadersInit),
      method: init.method ?? "GET",
      path,
      signal: init.signal,
    };
    calls.push(call);
    if (path.endsWith("/claim")) {
      return (claim.shift() ?? (() => ok({ claimed: true })))(call);
    }
    if (path.endsWith("/result")) {
      return (result.shift() ?? (() => ok({ accepted: true })))(call);
    }
    if (responders.other) {
      return responders.other(call);
    }
    return new Response(stream, {
      status: 201,
      headers: {
        "content-type": "text/event-stream",
        location: `/v1/agents/${agentId}/sessions/${sessionId}`,
      },
    });
  };
  return {
    calls,
    client: new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch }),
    fetch,
    of: (suffix: string) => calls.filter((call) => call.path.endsWith(suffix)),
  };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

function orderFunctions(
  execute: (input: { orderId: string }, context: unknown) => unknown = (
    input
  ) => ({ order: input.orderId })
) {
  const spy = vi.fn(execute);
  return {
    spy,
    functions: {
      getOrder: defineFunction({
        description: "Get an order",
        inputSchema: z.object({ orderId: z.string() }),
        execute: spy,
      }),
    } satisfies ChatFunctions,
  };
}

describe("chat function definitions", () => {
  it("sends descriptions and input JSON Schema, never handlers", async () => {
    const source = upstream();
    source.close();
    const { client, calls } = harness(source.stream);
    const { functions } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    await readAll(result.toStream());

    expect(calls[0].body).toStrictEqual({
      message,
      functions: {
        getOrder: {
          description: "Get an order",
          inputSchema: {
            type: "object",
            properties: { orderId: { type: "string" } },
            required: ["orderId"],
          },
        },
      },
    });
  });

  it("describes the input side of transformed schemas", async () => {
    const source = upstream();
    source.close();
    const { client, calls } = harness(source.stream);
    await client.chat({
      agentId,
      message,
      functions: {
        count: defineFunction({
          description: "Count",
          inputSchema: z.object({
            text: z.string().transform((t) => t.length),
          }),
          execute: ({ text }) => text + 1,
        }),
      },
    });
    expect(
      (calls[0].body as { functions: { count: { inputSchema: unknown } } })
        .functions.count.inputSchema
    ).toMatchObject({ properties: { text: { type: "string" } } });
  });

  it("omits an empty registry", async () => {
    const source = upstream();
    source.close();
    const { client, calls } = harness(source.stream);
    const result = await client.chat({ agentId, message, functions: {} });
    expect(calls[0].body).toStrictEqual({ message });
    expect(await readAll(result.toStream())).toBe("");
  });

  it.each([
    [
      "unrepresentable schemas",
      {
        when: defineFunction({
          description: "When",
          inputSchema: z.object({ at: z.date() }),
          execute: () => null,
        }),
      },
    ],
    [
      "reserved names",
      {
        bash: defineFunction({
          description: "Shadow",
          inputSchema: z.object({}),
          execute: () => null,
        }),
      },
    ],
    [
      "non-object inputs",
      {
        text: defineFunction({
          description: "Text",
          inputSchema: z.string(),
          execute: () => null,
        }),
      },
    ],
  ])("rejects %s before sending", async (_, functions) => {
    const { client, calls } = harness(upstream().stream);
    const error = await client
      .chat({ agentId, message, functions })
      .catch((e: unknown) => e);
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect((error as BlazingAgentsError).code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });
});

describe("chat function dispatch", () => {
  it("strips the ready event, claims, executes once, and submits the result", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    const before = sse({ type: "start" });
    const after = `${sse({ type: "text-delta", id: "t", delta: "hi" })}data: [DONE]\n\n`;
    source.push(before + sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    source.push(after);
    source.close();

    expect(await readAll(result.toStream())).toBe(before + after);
    const [claim] = of("/claim");
    const [submitted] = of("/result");
    expect(claim.path).toBe(`${callPath}/claim`);
    expect(claim.method).toBe("POST");
    expect(claim.body).toStrictEqual({
      claimRequestId: expect.stringMatching(UUID),
    });
    expect(submitted.body).toStrictEqual({
      claimRequestId: (claim.body as { claimRequestId: string }).claimRequestId,
      outcome: { kind: "output", value: { order: "o1" } },
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      { orderId: "o1" },
      { idempotencyKey: callId, signal: expect.any(AbortSignal) }
    );
  });

  it("keeps reading SSE while a handler runs", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    let release!: (value: unknown) => void;
    const { functions } = orderFunctions(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const result = await client.chat({ agentId, message, functions });
    const reader = result.toStream().getReader();
    const decoder = new TextDecoder();
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(release).toBeDefined());
    const progress = sse({ type: "data-progress", data: 1 });
    source.push(progress);

    expect(decoder.decode((await reader.read()).value)).toBe(progress);
    expect(of("/result")).toHaveLength(0);
    release({ ok: true });
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    source.close();
    expect((await reader.read()).done).toBe(true);
  });

  it("dispatches before tool-input-available and runs calls in parallel", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { functions } = orderFunctions(async ({ orderId }) => {
      started.push(orderId);
      await gate;
      return orderId;
    });
    const result = await client.chat({ agentId, message, functions });
    source.push(
      sse(readyEvent()) +
        sse(readyEvent({ id: "fc_fedcba9876543210", input: { orderId: "o2" } }))
    );
    await vi.waitFor(() => expect(started).toEqual(["o1", "o2"]));
    const toolInput = sse({
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "getOrder",
      input: { orderId: "o1" },
    });
    source.push(toolInput);
    const reader = result.toStream().getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      toolInput
    );
    release();
    await vi.waitFor(() => expect(of("/result")).toHaveLength(2));
    source.close();
    expect((await reader.read()).done).toBe(true);
  });

  it("runs independent calls concurrently and replayed events once", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    const second = readyEvent({ id: "fc_fedcba9876543210" });
    source.push(sse(readyEvent()) + sse(readyEvent()) + sse(second));
    source.close();
    await readAll(result.toStream());
    await vi.waitFor(() => expect(of("/result")).toHaveLength(2));
    expect(of("/claim")).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not execute when another claimant holds the call", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream, {
      claim: [() => status(409)],
    });
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/claim")).toHaveLength(1));
    source.close();
    await readAll(result.toStream());
    expect(spy).not.toHaveBeenCalled();
    expect(of("/result")).toHaveLength(0);
  });

  it("does not claim a call whose deadline has passed", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.push(
      sse(readyEvent({ deadlineAt: new Date(Date.now() - 1000).toISOString() }))
    );
    source.close();
    await readAll(result.toStream());
    expect(of("/claim")).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    expect(of("/result")).toHaveLength(0);
  });

  it("retries lost claim and result acknowledgements with the same nonce", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream, {
      claim: [
        () => {
          throw new TypeError("fetch failed");
        },
      ],
      result: [() => status(503), () => status(429)],
    });
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(3), {
      timeout: 3000,
    });
    source.close();
    await readAll(result.toStream());

    const nonces = [...of("/claim"), ...of("/result")].map(
      (call) => (call.body as { claimRequestId: string }).claimRequestId
    );
    expect(of("/claim")).toHaveLength(2);
    expect(new Set(nonces).size).toBe(1);
    expect(
      new Set(of("/result").map((call) => JSON.stringify(call.body))).size
    ).toBe(1);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("stops claim retries at the deadline without dispatching", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream, {
      claim: Array.from({ length: 20 }, () => () => status(500)),
    });
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.push(
      sse(readyEvent({ deadlineAt: new Date(Date.now() + 600).toISOString() }))
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    source.close();
    expect(await readAll(result.toStream())).toBe("");
    expect(of("/claim").length).toBeGreaterThan(1);
    expect(of("/claim").length).toBeLessThan(5);
    expect(spy).not.toHaveBeenCalled();
  });

  it("abandons a pending claim when the consumer cancels", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream, {
      claim: [
        (call) =>
          new Promise<Response>((_resolve, reject) =>
            call.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError"))
            )
          ),
      ],
    });
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    const stream = result.toStream();
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/claim")).toHaveLength(1));
    await stream.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(of("/claim")).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("retries 408 and honors Retry-After", async () => {
    const limited = (retryAfter: string) => () =>
      Response.json(
        { error: { code: "rate_limited", message: "Slow down" } },
        { status: 429, headers: { "retry-after": retryAfter } }
      );
    const source = upstream();
    const { client, of } = harness(source.stream, {
      claim: [
        () => status(408),
        limited("0"),
        limited(new Date(0).toUTCString()),
        limited("soon"),
      ],
    });
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1), {
      timeout: 3000,
    });
    source.close();
    await readAll(result.toStream());
    expect(of("/claim")).toHaveLength(5);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("does not retry a refused result", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream, {
      result: [() => status(409)],
    });
    const { functions } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    source.close();
    await readAll(result.toStream());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(of("/result")).toHaveLength(1);
  });

  it("stops result retries when the caller aborts", async () => {
    const source = upstream();
    const controller = new AbortController();
    const { client, of } = harness(source.stream, {
      result: Array.from({ length: 20 }, () => () => status(503)),
    });
    const { functions } = orderFunctions();
    await client.chat({
      agentId,
      message,
      functions,
      abortSignal: controller.signal,
    });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(of("/result")).toHaveLength(1);
  });

  it.each([
    ["a permanent claim refusal", { claim: [() => status(404)] }, 0],
    ["a permanent result refusal", { result: [() => status(400)] }, 1],
    [
      "an invalid acknowledgement",
      { claim: [() => ok({ claimed: false })] },
      0,
    ],
  ] as const)(
    "fails the stream visibly on %s",
    async (_, responders, results) => {
      const source = upstream();
      const { client, of } = harness(source.stream, responders);
      const { functions } = orderFunctions();
      const result = await client.chat({ agentId, message, functions });
      source.push(sse(readyEvent()));
      const error = await readAll(result.toStream()).catch((e: unknown) => e);
      expect(BlazingAgentsError.isInstance(error)).toBe(true);
      expect(of("/claim")).toHaveLength(1);
      expect(of("/result")).toHaveLength(results);
      expect(source.cancel).toHaveBeenCalled();
    }
  );

  it.each([
    [
      "a missing handler",
      readyEvent({ name: "constructor" }),
      { kind: "error", message: "Function constructor is not available." },
    ],
    [
      "invalid input",
      readyEvent({ input: { orderId: 1 } }),
      {
        kind: "error",
        message: "Invalid function input.",
      },
    ],
  ])(
    "reports %s after claiming without executing",
    async (_, event, outcome) => {
      const source = upstream();
      const { client, of } = harness(source.stream);
      const { functions, spy } = orderFunctions();
      const result = await client.chat({ agentId, message, functions });
      source.push(sse(event));
      await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
      source.close();
      await readAll(result.toStream());
      expect(of("/claim")).toHaveLength(1);
      expect((of("/result")[0].body as { outcome: unknown }).outcome).toEqual(
        outcome
      );
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "thrown errors",
      () => {
        throw new Error("password=secret");
      },
      { kind: "error", message: "Function execution failed." },
    ],
    [
      "unserializable values",
      () => ({ big: BigInt(1) }),
      {
        kind: "error",
        message: "Function returned an invalid result.",
      },
    ],
    [
      "oversized values",
      () => "x".repeat(300 * 1024),
      {
        kind: "error",
        message: "Function returned an invalid result.",
      },
    ],
    ["undefined", () => undefined, { kind: "output", value: null }],
    [
      "JSON-serializable objects",
      () => ({ at: new Date("2026-10-02T00:00:00.000Z"), skip: undefined }),
      { kind: "output", value: { at: "2026-10-02T00:00:00.000Z" } },
    ],
  ])("sanitizes %s", async (_, execute, outcome) => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions } = orderFunctions(execute);
    const result = await client.chat({ agentId, message, functions });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    source.close();
    await readAll(result.toStream());
    expect((of("/result")[0].body as { outcome: unknown }).outcome).toEqual(
      outcome
    );
  });

  it("forwards non-function events and preserves partial bytes", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    const lookalike = sse({
      type: "text-delta",
      delta: "data-ba-function-call",
    });
    const crlf = `data: ${JSON.stringify({ type: "start" })}\r\n\r\n`;
    const notJson = "data: {data-ba-function-call\n\n";
    const comment = ": keepalive\n\n";
    source.push(lookalike + crlf + notJson + comment);
    source.push('data: [DONE]\n\ndata: {"type":"te');
    source.push('xt"}');
    source.close();

    expect(await readAll(result.toStream())).toBe(
      `${lookalike + crlf + notJson + comment}data: [DONE]\n\ndata: {"type":"text"}`
    );
    expect(of("/claim")).toHaveLength(0);
  });

  it.each([
    ["non-transient", sse({ ...readyEvent(), transient: false })],
    ["malformed", `data:${JSON.stringify(readyEvent({ id: "bad" }))}\n\n`],
  ])("fails the stream on a %s ready event", async (_, text) => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    const start = sse({ type: "start" });
    const reader = result.toStream().getReader();
    source.push(start);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(start);
    source.push(text + text + sse({ type: "finish" }));
    const error = await reader.read().catch((e: unknown) => e);
    expect((error as BlazingAgentsError).code).toBe("stream_error");
    expect((error as BlazingAgentsError).message).toContain(
      "malformed function call event"
    );
    expect(source.cancel).toHaveBeenCalled();
    expect(of("/claim")).toHaveLength(0);
  });

  it("parses events split across chunks and multi-line data fields", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions, spy } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    const text = sse(readyEvent());
    source.push(text.slice(0, 20));
    source.push(text.slice(20));
    source.close();
    await readAll(result.toStream());
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    expect(spy).toHaveBeenCalledOnce();
  });

  it("aborts handlers when the stream ends", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    let signal!: AbortSignal;
    const { functions } = orderFunctions(
      (_, context) =>
        new Promise((_resolve, reject) => {
          signal = (context as { signal: AbortSignal }).signal;
          signal.addEventListener("abort", () => reject(signal.reason));
        })
    );
    const result = await client.chat({ agentId, message, functions });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(signal).toBeDefined());
    source.close();
    await readAll(result.toStream());
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    expect(signal.aborted).toBe(true);
  });

  it("aborts handlers at the call deadline", async () => {
    const source = upstream();
    const { client } = harness(source.stream);
    const aborted = vi.fn();
    const { functions } = orderFunctions((_, context) => {
      (context as { signal: AbortSignal }).signal.addEventListener(
        "abort",
        aborted
      );
      return new Promise(() => undefined);
    });
    await client.chat({ agentId, message, functions });
    source.push(
      sse(readyEvent({ deadlineAt: new Date(Date.now() + 200).toISOString() }))
    );
    await vi.waitFor(() => expect(aborted).toHaveBeenCalled(), {
      timeout: 2000,
    });
    source.close();
  });

  it("aborts handlers and cancels upstream when the consumer cancels", async () => {
    const source = upstream();
    const { client } = harness(source.stream);
    let signal!: AbortSignal;
    const { functions } = orderFunctions((_, context) => {
      signal = (context as { signal: AbortSignal }).signal;
      return new Promise(() => undefined);
    });
    const result = await client.chat({ agentId, message, functions });
    const stream = result.toStream();
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(signal).toBeDefined());
    await stream.cancel("gone");
    expect(signal.aborted).toBe(true);
    expect(source.cancel).toHaveBeenCalledWith("gone");
  });

  it("aborts handlers when the caller aborts the chat", async () => {
    const source = upstream();
    const { client } = harness(source.stream);
    const controller = new AbortController();
    let signal!: AbortSignal;
    const { functions } = orderFunctions((_, context) => {
      signal = (context as { signal: AbortSignal }).signal;
      return new Promise(() => undefined);
    });
    await client.chat({
      agentId,
      message,
      functions,
      abortSignal: controller.signal,
    });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(signal).toBeDefined());
    controller.abort();
    expect(signal.aborted).toBe(true);
    source.close();
  });

  it("surfaces upstream failures as stream errors", async () => {
    const source = upstream();
    const { client } = harness(source.stream);
    const { functions } = orderFunctions();
    const result = await client.chat({ agentId, message, functions });
    source.error(new Error("socket closed"));
    const error = await readAll(result.toStream()).catch((e: unknown) => e);
    expect((error as BlazingAgentsError).code).toBe("stream_error");
  });

  it("does not dispatch without a Session id", async () => {
    const source = upstream();
    const { client, fetch } = harness(source.stream, {
      other: () => new Response(source.stream, { status: 201 }),
    });
    const { functions } = orderFunctions();
    const result = await new BlazingAgents({
      apiKey: "ba_test",
      baseUrl: BASE,
      fetch,
    }).chat({ agentId, message, functions });
    await expect(result.sessionId).rejects.toThrow("Location");
    const event = sse(readyEvent());
    source.push(event);
    source.close();
    expect(await readAll(result.toStream())).toBe(event);
    expect(client).toBeDefined();
  });

  it("scopes protocol requests to the End user", async () => {
    const source = upstream();
    const { client, of } = harness(source.stream);
    const { functions } = orderFunctions();
    const result = await client
      .forUser("user-a")
      .chat({ agentId, message, functions, sessionId });
    source.push(sse(readyEvent()));
    await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
    source.close();
    await readAll(result.toStream());
    expect(of("/claim")[0].headers.get("x-ba-user-id")).toBe("user-a");
    expect(of("/result")[0].headers.get("x-ba-user-id")).toBe("user-a");
  });
});

describe("resumeChat", () => {
  const approvalsPath = `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals`;

  function resumeHarness(continuation: unknown) {
    const source = upstream();
    const h = harness(source.stream, {
      other: (call) =>
        call.path === approvalsPath
          ? ok({ data: [], continuation })
          : new Response(source.stream, {
              headers: { "content-type": "text/event-stream" },
            }),
    });
    return { ...h, source };
  }

  it.each(["queued", "running"])(
    "starts or joins a %s continuation with handlers attached",
    async (state) => {
      const { client, calls, of, source } = resumeHarness({
        id: "tac_1",
        state,
      });
      const { functions, spy } = orderFunctions();
      const result = await client
        .forUser("user-a")
        .resumeChat({ agentId, sessionId, functions });
      expect(await result.sessionId).toBe(sessionId);
      source.push(sse(readyEvent()));
      await vi.waitFor(() => expect(of("/result")).toHaveLength(1));
      source.close();
      await readAll(result.toStream());

      expect(calls[1]).toMatchObject({
        method: "POST",
        path: `/v1/agents/${agentId}/sessions/${sessionId}/tool-approval-continuations/tac_1/resume`,
        body: {},
      });
      expect(spy).toHaveBeenCalledOnce();
    }
  );

  it.each([
    null,
    { id: "tac_1", state: "waiting" },
    { id: "tac_1", state: "succeeded" },
  ])("refuses when no continuation can resume (%o)", async (continuation) => {
    const { client, calls } = resumeHarness(continuation);
    const { functions } = orderFunctions();
    const error = await client
      .resumeChat({ agentId, sessionId, functions })
      .catch((e: unknown) => e);
    expect((error as BlazingAgentsError).code).toBe("not_found");
    expect(calls).toHaveLength(1);
  });

  it("joins without dispatch when no handlers are supplied", async () => {
    const { client, source } = resumeHarness({ id: "tac_1", state: "running" });
    const result = await client.resumeChat({
      agentId,
      sessionId,
      functions: {},
      abortSignal: new AbortController().signal,
    });
    const event = sse(readyEvent());
    source.push(event);
    source.close();
    expect(await readAll(result.toStream())).toBe(event);
  });
});
