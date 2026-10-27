import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BlazingAgents } from "./client.ts";
import { defineFunction } from "./functions.ts";
import {
  createChatRelay,
  createCompletionRelay,
  type RelayContext,
} from "./relay.ts";
import type { FetchOption } from "./test/fixtures.ts";

const BASE = "http://api.test";
const agentId = "ag_0123456789abcdef";
const sessionId = "ss_0123456789abcdef";
const turnId = "tr_0123456789abcdef";
const SCOPE_HEADER = "x-ba-user-id";

const message: UIMessage = {
  id: "message-1",
  parts: [{ text: "Hello", type: "text" }],
  role: "user",
};
const context: RelayContext = {
  agentId,
  metadata: { plan: "demo" },
  userId: "user-a",
};
const sseBody = 'data: {"type":"text-delta","id":"t","delta":"Hi"}\n\n';

interface ApiCall {
  body: unknown;
  headers: Headers;
  method: string;
  path: string;
  signal?: AbortSignal | null;
}

type Respond = (call: ApiCall) => Response | Promise<Response>;

/**
 * A real client over a fake `fetch`, so each test asserts the HTTP request the
 * API would observe.
 */
function fakeApi(respond: Respond) {
  const calls: ApiCall[] = [];
  // biome-ignore lint/suspicious/useAwait: the fake fetch returns a Promise
  const fetch: FetchOption = async (url, init = {}) => {
    const call: ApiCall = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: new Headers(init.headers as HeadersInit),
      method: init.method ?? "GET",
      path: url.slice(BASE.length),
      signal: init.signal,
    };
    calls.push(call);
    return respond(call);
  };
  return {
    calls,
    client: new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch }),
  };
}

function chatReply() {
  return new Response(sseBody, {
    status: 201,
    headers: {
      "content-type": "text/event-stream",
      location: `/v1/agents/${agentId}/sessions/${sessionId}`,
      "x-ba-turn-id": turnId,
      "x-request-id": "req-chat",
    },
  });
}

function continueReply() {
  return new Response(sseBody, {
    headers: {
      "content-type": "text/event-stream",
      "x-ba-turn-id": turnId,
      "x-request-id": "req-continue",
    },
  });
}

function completionReply() {
  return new Response("Done", {
    headers: {
      "content-type": "text/plain",
      "x-request-id": "req-completion",
    },
  });
}

function apiError(status: number, code: string, requestId: string) {
  return Response.json(
    { error: { code, message: `${code} message.` } },
    { headers: { "x-request-id": requestId }, status }
  );
}

function request(body: unknown, init: RequestInit = {}): Request {
  return new Request("http://example.test/chat", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
    ...init,
  });
}

/** Resolves the End-user from a header, as a Tenant resolves its session cookie. */
function userFromHeader(incoming: Request): Promise<RelayContext> {
  return Promise.resolve({
    ...context,
    userId: incoming.headers.get("x-test-user") as string,
  });
}

const functions = {
  getOrder: defineFunction({
    description: "Get an order",
    inputSchema: z.object({ orderId: z.string() }),
    execute: () => null,
  }),
};

const approvalMessage: UIMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    { type: "step-start" },
    {
      type: "dynamic-tool",
      toolName: "getOrder",
      toolCallId: "call-1",
      state: "approval-responded",
      input: { orderId: "o1" },
      approval: { id: "approval-1", approved: true },
    },
    {
      type: "tool-bash",
      toolCallId: "call-2",
      state: "approval-responded",
      input: { command: "rm" },
      approval: { id: "approval-2", approved: false, reason: "No" },
    },
  ],
};
const decisions = [
  { approvalId: "approval-1", approved: true },
  { approvalId: "approval-2", approved: false, reason: "No" },
];
const continuePath = `/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals/continue`;

describe("createChatRelay", () => {
  it("creates a Session as the signed-in End-user and relays the API's headers", async () => {
    const { calls, client } = fakeApi(() => chatReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });

    const response = await relay(
      request({
        agentId: "ag_attackeragent0000",
        message,
        trigger: "submit-message",
        userId: "attacker",
      })
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toBe(`/v1/agents/${agentId}/sessions`);
    expect(calls[0].headers.get(SCOPE_HEADER)).toBe("user-a");
    expect(calls[0].headers.get("authorization")).toBe("Bearer ba_test");
    expect(calls[0].body).toEqual({
      messages: [message],
      metadata: context.metadata,
      trigger: "submit-message",
    });
    expect(response.status).toBe(201);
    expect(await response.text()).toBe(sseBody);
    expect(response.headers.get("location")).toBe(
      `/v1/agents/${agentId}/sessions/${sessionId}`
    );
    expect(response.headers.get("x-ba-turn-id")).toBe(turnId);
    expect(response.headers.get("x-request-id")).toBe("req-chat");
  });

  it("resumes and regenerates inside the End-user's scope", async () => {
    const { calls, client } = fakeApi(() => chatReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });

    await (await relay(request({ message, sessionId }))).text();
    await (
      await relay(
        request({
          message,
          messageId: "assistant-1",
          sessionId,
          trigger: "regenerate-message",
        })
      )
    ).text();

    expect(calls.map((call) => call.path)).toEqual([
      `/v1/agents/${agentId}/sessions/${sessionId}`,
      `/v1/agents/${agentId}/sessions/${sessionId}`,
    ]);
    expect(calls.map((call) => call.headers.get(SCOPE_HEADER))).toEqual([
      "user-a",
      "user-a",
    ]);
    expect(calls[0].body).toMatchObject({ trigger: "submit-message" });
    expect(calls[1].body).toMatchObject({
      messageId: "assistant-1",
      trigger: "regenerate-message",
    });
  });

  it("passes the request's functions to the API", async () => {
    const { calls, client } = fakeApi(() => chatReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve({ ...context, functions }),
    });

    await (await relay(request({ message }))).text();

    expect(calls[0].body).toMatchObject({
      functions: { getOrder: { description: "Get an order" } },
    });
  });

  it.each([
    ["without a Location header", {}],
    [
      "with a malformed Location header",
      { location: "/v1/agents/x/sessions/bad" },
    ],
  ])(
    "never relays function calls to the browser when a created Session comes back %s",
    async (_, location) => {
      const functionCall = {
        type: "data-ba-function-call",
        data: {
          id: "fc_0123456789abcdef",
          name: "getOrder",
          input: { orderId: "o1" },
          deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        },
        transient: true,
      };
      const { client } = fakeApi(
        () =>
          new Response(`data: ${JSON.stringify(functionCall)}\n\n${sseBody}`, {
            status: 201,
            headers: {
              "content-type": "text/event-stream",
              "x-ba-turn-id": turnId,
              "x-request-id": "req-chat",
              ...location,
            },
          })
      );
      const relay = createChatRelay({
        client,
        resolveContext: () => Promise.resolve({ ...context, functions }),
      });

      const response = await relay(request({ message }));
      const text = await response.text();

      expect(text).not.toContain("data-ba-function-call");
      expect(response.status).toBe(502);
      expect(response.headers.get("x-request-id")).toBe("req-chat");
      expect(JSON.parse(text)).toMatchObject({
        error: { code: "stream_error" },
      });
    }
  );

  it.each(["not_found", "workspace_not_found"])(
    "answers a Session outside the End-user's scope with the API's %s",
    async (code) => {
      const { calls, client } = fakeApi(() => apiError(404, code, "req-404"));
      const relay = createChatRelay({
        client,
        resolveContext: () => Promise.resolve(context),
      });

      for (const body of [
        { message, sessionId },
        { message: approvalMessage, sessionId },
      ]) {
        const response = await relay(request(body));
        expect(response.status).toBe(404);
        expect(response.headers.get("x-request-id")).toBe("req-404");
        expect(await response.json()).toEqual({
          error: { code, message: `${code} message.` },
        });
      }
      expect(calls).toHaveLength(2);
      expect(calls.map((call) => call.headers.get(SCOPE_HEADER))).toEqual([
        "user-a",
        "user-a",
      ]);
    }
  );

  it("submits an approval round as the End-user", async () => {
    const { calls, client } = fakeApi(() => continueReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve({ ...context, functions }),
    });

    const response = await relay(
      request({ message: approvalMessage, sessionId })
    );

    expect(await response.text()).toBe(sseBody);
    expect(response.headers.get("x-ba-turn-id")).toBe(turnId);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(continuePath);
    expect(calls[0].headers.get(SCOPE_HEADER)).toBe("user-a");
    expect(calls[0].body).toMatchObject({
      decisions,
      functions: { getOrder: { description: "Get an order" } },
    });
  });

  it("resumes an approval round as the executor when the request has no functions", async () => {
    const { calls, client } = fakeApi(() => continueReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });

    const response = await relay(
      request({ message: approvalMessage, sessionId })
    );

    expect(await response.text()).toBe(sseBody);
    expect(calls[0].body).toEqual({ decisions, functions: {} });
  });

  it("rejects an approval without a Session or responses before any API request", async () => {
    const { calls, client } = fakeApi(() => continueReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });

    const noSession = await relay(request({ message: approvalMessage }));
    const noDecisions = await relay(
      request({
        message: { id: "assistant-2", role: "assistant", parts: [] },
        sessionId,
      })
    );

    expect(noSession.status).toBe(400);
    expect(noDecisions.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("rejects unauthenticated, malformed, and system-message submissions before any API request", async () => {
    const { calls, client } = fakeApi(() => chatReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });
    const unauthenticated = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(null),
    });

    expect((await unauthenticated(request({ message }))).status).toBe(401);
    expect((await relay(request({ message: { nope: true } }))).status).toBe(
      400
    );
    expect(
      (
        await relay(
          new Request("http://example.test/chat", {
            body: "{",
            method: "POST",
          })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await relay(
          request({
            message: {
              id: "system",
              role: "system",
              parts: [{ type: "text", text: "System" }],
            },
          })
        )
      ).status
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("scopes each request to its own resolved End-user", async () => {
    const { calls, client } = fakeApi(() => chatReply());
    const relay = createChatRelay({ client, resolveContext: userFromHeader });

    for (const userId of ["user-a", "user-b", "user-a"]) {
      await (
        await relay(
          request({ message }, { headers: { "x-test-user": userId } })
        )
      ).text();
    }

    expect(calls.map((call) => call.headers.get(SCOPE_HEADER))).toEqual([
      "user-a",
      "user-b",
      "user-a",
    ]);
  });

  it("answers 500 without a leak, and sends nothing, when the resolver returns an invalid userId", async () => {
    const { calls, client } = fakeApi(() => chatReply());
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve({ ...context, userId: " padded " }),
    });

    const response = await relay(request({ message }));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal_error", message: "Request failed." },
    });
    expect(text).not.toContain("padded");
    expect(calls).toHaveLength(0);
  });

  it("aborts the API request when the browser stops", async () => {
    const { calls, client } = fakeApi(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const relay = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });
    const stop = new AbortController();

    const pending = relay(request({ message }, { signal: stop.signal }));
    await expect.poll(() => calls.length).toBe(1);
    stop.abort();
    const response = await pending;

    expect(calls[0].signal?.aborted).toBe(true);
    expect(response.status).toBe(499);
  });
});

describe("createCompletionRelay", () => {
  it("relays completion text as the signed-in End-user", async () => {
    const { calls, client } = fakeApi(() => completionReply());
    const relay = createCompletionRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });

    const response = await relay(
      request({ agentId: "attacker", prompt: " Explain ", userId: "attacker" })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Done");
    expect(response.headers.get("x-request-id")).toBe("req-completion");
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(`/v1/agents/${agentId}/generation`);
    expect(calls[0].headers.get(SCOPE_HEADER)).toBe("user-a");
    expect(calls[0].body).toEqual({
      metadata: context.metadata,
      output: { type: "text" },
      prompt: "Explain",
    });
  });

  it("scopes each request to its own resolved End-user", async () => {
    const { calls, client } = fakeApi(() => completionReply());
    const relay = createCompletionRelay({
      client,
      resolveContext: userFromHeader,
    });

    for (const userId of ["user-a", "user-b"]) {
      await (
        await relay(
          request({ prompt: "Hello" }, { headers: { "x-test-user": userId } })
        )
      ).text();
    }

    expect(calls.map((call) => call.headers.get(SCOPE_HEADER))).toEqual([
      "user-a",
      "user-b",
    ]);
  });

  it("answers 500 without a leak, and sends nothing, when the resolver returns an invalid userId", async () => {
    const { calls, client } = fakeApi(() => completionReply());
    const relay = createCompletionRelay({
      client,
      resolveContext: () => Promise.resolve({ ...context, userId: " padded " }),
    });

    const response = await relay(request({ prompt: "Hello" }));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal_error", message: "Request failed." },
    });
    expect(text).not.toContain("padded");
    expect(calls).toHaveLength(0);
  });

  it("returns safe errors while preserving the upstream status and request id", async () => {
    const { client } = fakeApi(() =>
      apiError(429, "rate_limited", "request-3")
    );
    const relay = createCompletionRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });

    const response = await relay(request({ prompt: "Hello" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("x-request-id")).toBe("request-3");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "rate_limited message." },
    });
  });

  it("maps aborts, network failures, invalid bodies, missing auth, and resolver failures", async () => {
    const aborted = fakeApi(() =>
      Promise.reject(new DOMException("aborted", "AbortError"))
    );
    const unreachable = fakeApi(() =>
      Promise.reject(new TypeError("upstream unavailable"))
    );
    const resolve = () => Promise.resolve(context);
    const abortedRelay = createCompletionRelay({
      client: aborted.client,
      resolveContext: resolve,
    });
    const unreachableRelay = createCompletionRelay({
      client: unreachable.client,
      resolveContext: resolve,
    });
    const unauthenticated = createCompletionRelay({
      client: aborted.client,
      resolveContext: () => Promise.resolve(null),
    });
    const broken = createCompletionRelay({
      client: aborted.client,
      resolveContext: () => Promise.reject(new Error("secret")),
    });

    expect((await abortedRelay(request({ prompt: "Hello" }))).status).toBe(499);
    expect((await abortedRelay(request({ prompt: " " }))).status).toBe(400);
    expect((await unauthenticated(request({ prompt: "Hello" }))).status).toBe(
      401
    );
    expect((await unreachableRelay(request({ prompt: "Hello" }))).status).toBe(
      502
    );
    const response = await broken(request({ prompt: "Hello" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
