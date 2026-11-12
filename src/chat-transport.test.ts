import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlazingAgentsChatTransport, BlazingAgentsError } from "./index.ts";
import { sseStream } from "./test/fixtures.ts";
import { chatChunks } from "./test/generation-fixtures.ts";

const firstMessage: UIMessage = {
  id: "message-1",
  parts: [{ text: "First", type: "text" }],
  role: "user",
};
const firstResponse: UIMessage = {
  id: "response-1",
  parts: [{ text: "Answer", type: "text" }],
  role: "assistant",
};
const secondMessage: UIMessage = {
  id: "message-2",
  parts: [{ text: "Second", type: "text" }],
  role: "user",
};

describe("BlazingAgentsChatTransport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a malformed Session ID with a typed SDK error", () => {
    expect(
      () => new BlazingAgentsChatTransport({ sessionId: "invalid" })
    ).toThrow(
      expect.objectContaining({ code: "invalid_request", param: "sessionId" })
    );
  });

  it("adapts AI SDK messages and resumes with the server-minted Session ID", async () => {
    const requests: Record<string, unknown>[] = [];
    const onSessionId = vi.fn();
    const fetch = (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve(
        new Response(sseStream(chatChunks), {
          headers:
            requests.length === 1
              ? {
                  location:
                    "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef",
                }
              : undefined,
        })
      );
    };
    const transport = new BlazingAgentsChatTransport({
      body: {
        locale: "en-GB",
        op: "history",
        message: firstResponse,
        messageId: "configured-message-id",
        sessionId: "ss_BBBBBBBBBBBBBBBB",
        trigger: "regenerate-message",
      },
      fetch,
      onSessionId,
    });
    const base = {
      abortSignal: undefined,
      body: undefined,
      chatId: "client-chat-id",
      headers: undefined,
      messageId: undefined,
      metadata: undefined,
      trigger: "submit-message" as const,
    };

    for await (const _chunk of await transport.sendMessages({
      ...base,
      messages: [firstMessage],
    })) {
      /** Drain the transport response. */
    }
    for await (const _chunk of await transport.sendMessages({
      ...base,
      messages: [firstMessage, firstResponse, secondMessage],
    })) {
      /** Drain the transport response. */
    }

    expect(requests).toEqual([
      {
        locale: "en-GB",
        op: "chat",
        message: firstMessage,
        trigger: "submit-message",
      },
      {
        locale: "en-GB",
        op: "chat",
        message: secondMessage,
        sessionId: "ss_0123456789abcdef",
        trigger: "submit-message",
      },
    ]);
    expect(onSessionId).toHaveBeenCalledOnce();
    expect(onSessionId).toHaveBeenCalledWith("ss_0123456789abcdef");
    expect(transport.sessionId).toBe("ss_0123456789abcdef");
  });

  it("reports the running Turn ID from every response that names one, and each Turn's start", async () => {
    const turnIds = ["turn_0123456789abcdef", undefined, "turn_short"];
    let call = 0;
    const fetch = () => {
      const turnId = turnIds[call];
      call += 1;
      return Promise.resolve(
        new Response(sseStream(chatChunks), {
          headers: turnId === undefined ? {} : { "x-ba-turn-id": turnId },
        })
      );
    };
    const onTurnId = vi.fn();
    const onTurnStart = vi.fn();
    const transport = new BlazingAgentsChatTransport({
      fetch,
      onTurnId,
      onTurnStart,
      sessionId: "ss_0123456789abcdef",
    });

    for (const _ of turnIds) {
      for await (const _chunk of await transport.sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstMessage],
        trigger: "submit-message",
      })) {
        /** Drain the transport response. */
      }
    }

    expect(onTurnId).toHaveBeenCalledOnce();
    expect(onTurnId).toHaveBeenCalledWith("turn_0123456789abcdef");
    expect(onTurnStart).toHaveBeenCalledTimes(3);
  });

  it("rejects an error response with the relay's BlazingAgentsError and records no Session or Turn", async () => {
    const fetch = () =>
      Promise.resolve(
        Response.json(
          {
            error: { code: "forbidden", message: "Session is not available." },
          },
          { status: 403 }
        )
      );
    const onSessionId = vi.fn();
    const onTurnId = vi.fn();
    const onTurnStart = vi.fn();
    const transport = new BlazingAgentsChatTransport({
      fetch,
      onSessionId,
      onTurnId,
      onTurnStart,
    });

    const error = await transport
      .sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstMessage],
        trigger: "submit-message",
      })
      .catch((caught: unknown) => caught);
    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      code: "forbidden",
      message: "Session is not available.",
      status: 403,
    });
    expect(onSessionId).not.toHaveBeenCalled();
    expect(onTurnId).not.toHaveBeenCalled();
    expect(onTurnStart).not.toHaveBeenCalled();
  });

  it("resumes from an authorized initial Session ID after a reload", async () => {
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        op: "chat",
        message: firstMessage,
        sessionId: "ss_0123456789abcdef",
        trigger: "submit-message",
      });
      return Promise.resolve(new Response(sseStream(chatChunks)));
    });
    const onSessionId = vi.fn();
    const transport = new BlazingAgentsChatTransport({
      fetch,
      onSessionId,
      sessionId: "ss_0123456789abcdef",
    });

    for await (const _chunk of await transport.sendMessages({
      abortSignal: undefined,
      chatId: "client-chat-id",
      messageId: undefined,
      messages: [firstMessage],
      trigger: "submit-message",
    })) {
      /** Drain the transport response. */
    }

    expect(fetch).toHaveBeenCalledOnce();
    expect(onSessionId).not.toHaveBeenCalled();
  });

  it("cancels a started Turn when Session persistence fails", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel,
          }),
          {
            headers: {
              location:
                "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef",
            },
          }
        )
      )
    );
    const transport = new BlazingAgentsChatTransport({
      fetch,
      onSessionId: () => Promise.reject(new Error("persistence failed")),
    });

    await expect(
      transport.sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstMessage],
        trigger: "submit-message",
      })
    ).rejects.toThrow("persistence failed");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("forwards regenerate metadata and configured body fields", async () => {
    const requests: Record<string, unknown>[] = [];
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve(
        new Response(sseStream(chatChunks), {
          headers: {
            location:
              "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef",
          },
        })
      );
    });
    const transport = new BlazingAgentsChatTransport({
      body: { locale: "en-GB" },
      fetch,
    });

    for await (const _chunk of await transport.sendMessages({
      abortSignal: undefined,
      chatId: "client-chat-id",
      messageId: "response-1",
      messages: [firstMessage, firstResponse],
      trigger: "regenerate-message",
    })) {
      /** Drain the transport response. */
    }

    expect(requests[0]).toEqual({
      locale: "en-GB",
      op: "chat",
      message: firstMessage,
      messageId: "response-1",
      trigger: "regenerate-message",
    });
    await expect(
      transport.reconnectToStream({ chatId: "client-chat-id" })
    ).resolves.toBeNull();
  });

  it("rejects a successful create response without a valid Session Location", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              cancel,
            })
          )
        )
      )
    );
    const transport = new BlazingAgentsChatTransport();

    await expect(
      transport.sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstMessage],
        trigger: "submit-message",
      })
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a submission with no user message before fetching", async () => {
    const fetch = vi.fn();
    const transport = new BlazingAgentsChatTransport({ fetch });

    await expect(
      transport.sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstResponse],
        trigger: "submit-message",
      })
    ).rejects.toThrow("requires a user message");
    expect(fetch).not.toHaveBeenCalled();
  });

  const approvalResponse: UIMessage = {
    id: "response-1",
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
    ],
  };

  it("relays approval responses as the assistant message", async () => {
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        op: "chat",
        message: approvalResponse,
        sessionId: "ss_0123456789abcdef",
        trigger: "submit-message",
      });
      return Promise.resolve(new Response(sseStream(chatChunks)));
    });
    const transport = new BlazingAgentsChatTransport({
      fetch,
      sessionId: "ss_0123456789abcdef",
    });

    for await (const _chunk of await transport.sendMessages({
      abortSignal: undefined,
      chatId: "client-chat-id",
      messageId: undefined,
      messages: [firstMessage, approvalResponse],
      trigger: "submit-message",
    })) {
      /** Drain the transport response. */
    }
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("requires a Session before relaying approval responses", async () => {
    const fetch = vi.fn();
    const transport = new BlazingAgentsChatTransport({ fetch });

    await expect(
      transport.sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstMessage, approvalResponse],
        trigger: "submit-message",
      })
    ).rejects.toThrow("requires an existing Session");
    expect(fetch).not.toHaveBeenCalled();
  });
});

const sessionId = "ss_0123456789abcdef";
const steerConsumed = {
  type: "data-ba-steer-consumed",
  transient: true,
  data: {
    requestId: "steer-1",
    turnId: "turn_0123456789abcdef",
    sequence: 1,
    message: { ...secondMessage, role: "user" },
  },
};

interface RelayCall {
  body: Record<string, unknown>;
  credentials: RequestCredentials | undefined;
  headers: Headers;
  url: string;
}

/** A relay `fetch` that records each JSON op and answers it with `respond`. */
function fakeRelay(respond: (body: Record<string, unknown>) => Response) {
  const calls: RelayCall[] = [];
  const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({
      body,
      credentials: init?.credentials,
      headers: new Headers(init?.headers),
      url: String(url),
    });
    return Promise.resolve(respond(body));
  });
  return { calls, fetch };
}

function historyPage(data: unknown[], nextCursor: string | null) {
  return Response.json({ data, nextCursor });
}

function relayError(status: number, code: string) {
  return Response.json(
    { error: { code, message: `${code} message.` } },
    { status, headers: { "x-request-id": `req-${status}` } }
  );
}

describe("BlazingAgentsChatTransport steer events", () => {
  it("reports each steer the running Turn read and still streams the chunk", async () => {
    const onSteerConsumed = vi.fn();
    const transport = new BlazingAgentsChatTransport({
      fetch: () =>
        Promise.resolve(
          new Response(
            sseStream([
              steerConsumed,
              { ...steerConsumed, data: { requestId: "missing-fields" } },
              ...chatChunks,
            ])
          )
        ),
      onSteerConsumed,
      sessionId,
    });

    const types: string[] = [];
    for await (const chunk of await transport.sendMessages({
      abortSignal: undefined,
      chatId: "client-chat-id",
      messageId: undefined,
      messages: [firstMessage],
      trigger: "submit-message",
    })) {
      types.push(chunk.type);
    }

    expect(onSteerConsumed).toHaveBeenCalledOnce();
    expect(onSteerConsumed).toHaveBeenCalledWith("steer-1");
    expect(types.slice(0, 2)).toEqual([
      "data-ba-steer-consumed",
      "data-ba-steer-consumed",
    ]);
  });

  it("reports a Turn's finish chunk, and nothing for a stream that ends in abort", async () => {
    const streams = [
      chatChunks,
      [...chatChunks.slice(0, -1), { type: "abort" }],
    ];
    let call = 0;
    const onTurnFinish = vi.fn();
    const transport = new BlazingAgentsChatTransport({
      fetch: () => {
        call += 1;
        return Promise.resolve(new Response(sseStream(streams[call - 1])));
      },
      onTurnFinish,
      sessionId,
    });

    for (const _ of streams) {
      for await (const _chunk of await transport.sendMessages({
        abortSignal: undefined,
        chatId: "client-chat-id",
        messageId: undefined,
        messages: [firstMessage],
        trigger: "submit-message",
      })) {
        /** Drain the transport response. */
      }
      expect(onTurnFinish).toHaveBeenCalledOnce();
    }
  });
});

describe("BlazingAgentsChatTransport.loadHistory", () => {
  it("walks the relay's pages back to the oldest and returns the transcript oldest first", async () => {
    const { calls, fetch } = fakeRelay((body) =>
      body.cursor === undefined
        ? historyPage(
            [
              { ...secondMessage, branchable: true },
              { ...firstResponse, id: "response-2" },
            ],
            "cursor-older"
          )
        : historyPage([firstMessage, firstResponse], null)
    );
    const transport = new BlazingAgentsChatTransport({
      api: "/relay",
      body: () => ({ locale: "en-GB", op: "chat" }),
      credentials: "include",
      fetch,
      headers: () => Promise.resolve({ authorization: "Bearer token-1" }),
      sessionId,
    });

    const messages = await transport.loadHistory();

    expect(messages).toEqual([
      firstMessage,
      firstResponse,
      secondMessage,
      { ...firstResponse, id: "response-2" },
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      { locale: "en-GB", op: "history", sessionId },
      { locale: "en-GB", op: "history", sessionId, cursor: "cursor-older" },
    ]);
    expect(calls[0].url).toBe("/relay");
    expect(calls[0].credentials).toBe("include");
    expect(calls[0].headers.get("authorization")).toBe("Bearer token-1");
    expect(calls[0].headers.get("content-type")).toBe("application/json");
  });

  it("keeps one copy of a message that a commit shifted onto two pages", async () => {
    const { fetch } = fakeRelay((body) =>
      body.cursor === undefined
        ? historyPage([firstResponse, secondMessage], "cursor-older")
        : historyPage([firstMessage, firstResponse], null)
    );
    const transport = new BlazingAgentsChatTransport({ fetch, sessionId });

    expect(await transport.loadHistory()).toEqual([
      firstMessage,
      firstResponse,
      secondMessage,
    ]);
  });

  it("stops at a repeated cursor and after 50 pages", async () => {
    const repeating = fakeRelay(() => historyPage([], "cursor-same"));
    let page = 0;
    const endless = fakeRelay(() => {
      page += 1;
      return historyPage(
        [{ ...firstMessage, id: `message-${page}` }],
        `cursor-${page}`
      );
    });

    await new BlazingAgentsChatTransport({
      fetch: repeating.fetch,
      sessionId,
    }).loadHistory();
    const messages = await new BlazingAgentsChatTransport({
      fetch: endless.fetch,
      sessionId,
    }).loadHistory();

    expect(repeating.calls).toHaveLength(2);
    expect(endless.calls).toHaveLength(50);
    expect(messages[0].id).toBe("message-50");
  });

  it("returns an empty transcript for a new or empty Session", async () => {
    const { calls, fetch } = fakeRelay(() => historyPage([], null));

    expect(
      await new BlazingAgentsChatTransport({ fetch }).loadHistory()
    ).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(
      await new BlazingAgentsChatTransport({ fetch, sessionId }).loadHistory()
    ).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("rejects with the relay's 404 when the Session is gone or another End-user's", async () => {
    const { fetch } = fakeRelay(() => relayError(404, "not_found"));
    const transport = new BlazingAgentsChatTransport({ fetch, sessionId });

    const error = await transport.loadHistory().catch((caught) => caught);

    expect(error).toBeInstanceOf(BlazingAgentsError);
    expect(error).toMatchObject({
      code: "not_found",
      requestId: "req-404",
      status: 404,
    });
  });

  it.each([
    ["a malformed page", () => Response.json({ data: "nope" })],
    ["a non-JSON page", () => new Response("<html>")],
    [
      "a malformed stored message",
      () => historyPage([{ id: "x", role: "robot", parts: [] }], null),
    ],
  ])("rejects %s with invalid_response", async (_, respond) => {
    const { fetch } = fakeRelay(respond);
    const transport = new BlazingAgentsChatTransport({ fetch, sessionId });

    await expect(transport.loadHistory()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects an unreachable relay with network_error", async () => {
    const transport = new BlazingAgentsChatTransport({
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      sessionId,
    });

    await expect(transport.loadHistory()).rejects.toMatchObject({
      code: "network_error",
    });
  });
});

describe("BlazingAgentsChatTransport.steer", () => {
  const steerMessage = { ...secondMessage, role: "user" as const };

  it.each([
    ["accepted", "accepted"],
    ["committed", "committed"],
    ["not_placed", "resend"],
  ])("answers a %s receipt with %s", async (state, outcome) => {
    const { calls, fetch } = fakeRelay(() =>
      Response.json({ state }, { status: 202 })
    );
    const transport = new BlazingAgentsChatTransport({ fetch, sessionId });

    expect(
      await transport.steer({ message: steerMessage, requestId: "steer-1" })
    ).toBe(outcome);
    expect(calls[0].body).toEqual({
      op: "steer",
      sessionId,
      requestId: "steer-1",
      message: steerMessage,
    });
  });

  it("answers the relay's 409 steer_not_available with resend", async () => {
    const { fetch } = fakeRelay(() => relayError(409, "steer_not_available"));
    const transport = new BlazingAgentsChatTransport({ fetch, sessionId });

    expect(
      await transport.steer({ message: steerMessage, requestId: "steer-1" })
    ).toBe("resend");
  });

  it("rejects other relay errors with their code", async () => {
    const { fetch } = fakeRelay(() =>
      relayError(409, "input_idempotency_conflict")
    );
    const transport = new BlazingAgentsChatTransport({ fetch, sessionId });

    await expect(
      transport.steer({ message: steerMessage, requestId: "steer-1" })
    ).rejects.toMatchObject({
      code: "input_idempotency_conflict",
      status: 409,
    });
  });

  it("rejects before any request when there is no Session yet", async () => {
    const { calls, fetch } = fakeRelay(() => relayError(500, "unreachable"));
    const transport = new BlazingAgentsChatTransport({ fetch });

    await expect(
      transport.steer({ message: steerMessage, requestId: "steer-1" })
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(calls).toHaveLength(0);
  });
});
