import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { BlazingAgents } from "./client.ts";
import { BlazingAgentsError } from "./errors.ts";
import { defineFunction } from "./functions.ts";
import {
  createChatRelay,
  createCompletionRelay,
  type RelayContext,
  type SessionOwnershipStore,
} from "./relay.ts";

const message: UIMessage = {
  id: "message-1",
  parts: [{ text: "Hello", type: "text" }],
  role: "user",
};
const context: RelayContext = {
  agentId: "ag_0123456789abcdef",
  metadata: { plan: "demo" },
  userId: "user-a",
  version: 2,
};

function request(body: unknown): Request {
  return new Request("http://example.test/chat", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function approvalsResource(continuationId = "tac_1") {
  return {
    decideToolApproval: vi.fn(() =>
      Promise.resolve({ continuationId, state: "queued" as const })
    ),
    joinToolApprovalContinuation: vi.fn(() =>
      Promise.resolve({
        toStream: () => new ReadableStream<Uint8Array>(),
        toResponse: () => new Response("joined"),
      })
    ),
  } as unknown as BlazingAgents["sessions"];
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

function sessions(owner?: string): SessionOwnershipStore {
  return {
    ownerOf: vi.fn(() => Promise.resolve(owner)),
    recordOwner: vi.fn(() => Promise.resolve()),
  };
}

describe("relay factories", () => {
  it("creates a Session with trusted context and records its owner", async () => {
    const store = sessions();
    const chat = vi.fn(() =>
      Promise.resolve({
        requestId: "request-1",
        sessionId: Promise.resolve("ss_0123456789abcdef"),
        toStream: () => new ReadableStream<Uint8Array>(),
        toResponse: () =>
          new Response("chat", {
            headers: {
              location:
                "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef",
            },
          }),
      })
    );
    const relay = createChatRelay({
      client: { chat, resumeChat: vi.fn(), sessions: approvalsResource() },
      resolveContext: () => Promise.resolve(context),
      sessions: store,
    });

    const response = await relay(
      request({
        agentId: "attacker-agent",
        message,
        sessionId: undefined,
        trigger: "submit-message",
        userId: "attacker",
        version: 99,
      })
    );

    expect(await response.text()).toBe("chat");
    expect(chat).toHaveBeenCalledWith({
      agentId: context.agentId,
      message,
      messageId: undefined,
      metadata: context.metadata,
      abortSignal: expect.any(AbortSignal),
      trigger: "submit-message",
      userId: context.userId,
      version: 2,
    });
    expect(store.recordOwner).toHaveBeenCalledWith(
      "ss_0123456789abcdef",
      "user-a"
    );
  });

  it("authorizes resume and forwards regeneration", async () => {
    const store = sessions("user-a");
    const chat = vi.fn(() =>
      Promise.resolve({
        sessionId: Promise.resolve("ss_0123456789abcdef"),
        toStream: () => new ReadableStream<Uint8Array>(),
        toResponse: () => new Response("resumed"),
      })
    );
    const relay = createChatRelay({
      client: { chat, resumeChat: vi.fn(), sessions: approvalsResource() },
      resolveContext: () => Promise.resolve(context),
      sessions: store,
    });

    expect(
      await (
        await relay(
          request({
            message,
            messageId: "assistant-1",
            sessionId: "ss_0123456789abcdef",
            trigger: "regenerate-message",
          })
        )
      ).text()
    ).toBe("resumed");
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "assistant-1",
        sessionId: "ss_0123456789abcdef",
        trigger: "regenerate-message",
      })
    );
    expect(store.recordOwner).not.toHaveBeenCalled();
  });

  it("rejects missing authentication, foreign Sessions, and invalid chat", async () => {
    const client = {
      chat: vi.fn(),
      resumeChat: vi.fn(),
      sessions: approvalsResource(),
    };
    const unauthenticated = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(null),
      sessions: sessions(),
    });
    const foreign = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
      sessions: sessions("user-b"),
    });

    expect((await unauthenticated(request({ message }))).status).toBe(401);
    expect(
      (await foreign(request({ message, sessionId: "ss_0123456789abcdef" })))
        .status
    ).toBe(403);
    expect((await foreign(request({ message: { nope: true } }))).status).toBe(
      400
    );
    expect(
      (
        await foreign(
          new Request("http://example.test/chat", {
            body: "{",
            method: "POST",
          })
        )
      ).status
    ).toBe(400);
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("cancels a created Turn when ownership persistence fails", async () => {
    const cancel = vi.fn(() => Promise.reject(new Error("cancel failed")));
    const store = sessions();
    vi.mocked(store.recordOwner).mockRejectedValue(new Error("disk failed"));
    const relay = createChatRelay({
      client: {
        chat: () =>
          Promise.resolve({
            sessionId: Promise.resolve("ss_0123456789abcdef"),
            toStream: () => new ReadableStream<Uint8Array>(),
            toResponse: () =>
              new Response(new ReadableStream({ cancel })) as Response,
          }),
        resumeChat: vi.fn(),
        sessions: approvalsResource(),
      },
      resolveContext: () => Promise.resolve(context),
      sessions: store,
    });

    expect((await relay(request({ message }))).status).toBe(500);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("relays completion text with trusted attribution", async () => {
    const completion = vi.fn(() =>
      Promise.resolve({
        requestId: "request-2",
        text: Promise.resolve("done"),
        textStream: new ReadableStream<string>(),
        toResponse: () =>
          new Response("completion", {
            headers: { "x-request-id": "request-2" },
            status: 201,
          }),
      })
    );
    const relay = createCompletionRelay({
      client: { completion },
      resolveContext: () => Promise.resolve(context),
    });

    const response = await relay(
      request({ agentId: "attacker", prompt: " Explain ", userId: "attacker" })
    );

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("completion");
    expect(completion).toHaveBeenCalledWith({
      agentId: context.agentId,
      metadata: context.metadata,
      prompt: "Explain",
      abortSignal: expect.any(AbortSignal),
      userId: context.userId,
      version: 2,
    });
  });

  it("returns safe completion errors while preserving upstream status and request id", async () => {
    const relay = createCompletionRelay({
      client: {
        completion: () =>
          Promise.reject(
            new BlazingAgentsError({
              code: "quota_exceeded",
              headers: new Headers({ "x-request-id": "request-3" }),
              message: "Quota exceeded.",
              status: 429,
            })
          ),
      },
      resolveContext: () => Promise.resolve(context),
    });

    const response = await relay(request({ prompt: "Hello" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("x-request-id")).toBe("request-3");
    expect(await response.json()).toEqual({
      error: { code: "quota_exceeded", message: "Quota exceeded." },
    });
  });

  it("maps aborts, invalid bodies, missing auth, and unexpected failures", async () => {
    const client = {
      chat: vi.fn(),
      completion: vi.fn(() =>
        Promise.reject(
          new BlazingAgentsError({
            code: "request_aborted",
            message: "aborted",
          })
        )
      ),
    };
    const relay = createCompletionRelay({
      client,
      resolveContext: () => Promise.resolve(context),
    });
    const unauthenticated = createCompletionRelay({
      client,
      resolveContext: () => Promise.resolve(null),
    });
    const broken = createCompletionRelay({
      client,
      resolveContext: () => Promise.reject(new Error("secret")),
    });

    expect((await relay(request({ prompt: "Hello" }))).status).toBe(499);
    expect((await relay(request({ prompt: " " }))).status).toBe(400);
    expect((await unauthenticated(request({ prompt: "Hello" }))).status).toBe(
      401
    );
    const response = await broken(request({ prompt: "Hello" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");

    vi.mocked(client.completion).mockRejectedValueOnce(
      new BlazingAgentsError({
        code: "network_error",
        message: "upstream unavailable",
        requestId: "request-4",
      })
    );
    const unavailable = await relay(request({ prompt: "Hello" }));
    expect(unavailable.status).toBe(502);
    expect(unavailable.headers.get("x-request-id")).toBe("request-4");
  });

  it("passes the request's functions to chat", async () => {
    const chat = vi.fn(() =>
      Promise.resolve({
        sessionId: Promise.resolve("ss_0123456789abcdef"),
        toStream: () => new ReadableStream<Uint8Array>(),
        toResponse: () => new Response("chat"),
      })
    );
    const relay = createChatRelay({
      client: { chat, resumeChat: vi.fn(), sessions: approvalsResource() },
      resolveContext: () => Promise.resolve({ ...context, functions }),
      sessions: sessions(),
    });
    await relay(request({ message }));
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ functions }));
  });

  it("decides approval responses and resumes with the request's functions", async () => {
    const resources = approvalsResource();
    const resumeChat = vi.fn(() =>
      Promise.resolve({
        sessionId: Promise.resolve("ss_0123456789abcdef"),
        toStream: () => new ReadableStream<Uint8Array>(),
        toResponse: () => new Response("resumed"),
      })
    );
    const relay = createChatRelay({
      client: { chat: vi.fn(), resumeChat, sessions: resources },
      resolveContext: () => Promise.resolve({ ...context, functions }),
      sessions: sessions("user-a"),
    });

    const response = await relay(
      request({ message: approvalMessage, sessionId: "ss_0123456789abcdef" })
    );

    expect(await response.text()).toBe("resumed");
    const target = {
      agentId: context.agentId,
      sessionId: "ss_0123456789abcdef",
      abortSignal: expect.any(AbortSignal),
    };
    expect(vi.mocked(resources.decideToolApproval).mock.calls).toEqual([
      [
        {
          ...target,
          approvalId: "approval-1",
          approved: true,
          reason: undefined,
        },
      ],
      [{ ...target, approvalId: "approval-2", approved: false, reason: "No" }],
    ]);
    expect(resumeChat).toHaveBeenCalledWith({ ...target, functions });
    expect(resources.joinToolApprovalContinuation).not.toHaveBeenCalled();
  });

  it("resumes as the executor with an empty registry", async () => {
    const resources = approvalsResource();
    const resumeChat = vi.fn(() =>
      Promise.resolve({
        sessionId: Promise.resolve("ss_0123456789abcdef"),
        toStream: () => new ReadableStream<Uint8Array>(),
        toResponse: () => new Response("resumed"),
      })
    );
    const relay = createChatRelay({
      client: { chat: vi.fn(), resumeChat, sessions: resources },
      resolveContext: () => Promise.resolve({ ...context, functions: {} }),
      sessions: sessions("user-a"),
    });
    await relay(
      request({ message: approvalMessage, sessionId: "ss_0123456789abcdef" })
    );
    expect(resumeChat).toHaveBeenCalledWith(
      expect.objectContaining({ functions: {} })
    );
    expect(resources.joinToolApprovalContinuation).not.toHaveBeenCalled();
  });

  it("joins the continuation when the request has no functions", async () => {
    const resources = approvalsResource();
    const resumeChat = vi.fn();
    const relay = createChatRelay({
      client: { chat: vi.fn(), resumeChat, sessions: resources },
      resolveContext: () => Promise.resolve(context),
      sessions: sessions("user-a"),
    });

    const response = await relay(
      request({ message: approvalMessage, sessionId: "ss_0123456789abcdef" })
    );

    expect(await response.text()).toBe("joined");
    expect(resources.joinToolApprovalContinuation).toHaveBeenCalledWith({
      agentId: context.agentId,
      sessionId: "ss_0123456789abcdef",
      abortSignal: expect.any(AbortSignal),
      continuationId: "tac_1",
    });
    expect(resumeChat).not.toHaveBeenCalled();
  });

  it("rejects approval relays without a Session, ownership, or responses", async () => {
    const resources = approvalsResource();
    const client = { chat: vi.fn(), resumeChat: vi.fn(), sessions: resources };
    const owned = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
      sessions: sessions("user-a"),
    });
    const foreign = createChatRelay({
      client,
      resolveContext: () => Promise.resolve(context),
      sessions: sessions("user-b"),
    });

    expect((await owned(request({ message: approvalMessage }))).status).toBe(
      400
    );
    expect(
      (
        await foreign(
          request({
            message: approvalMessage,
            sessionId: "ss_0123456789abcdef",
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await owned(
          request({
            message: { id: "assistant-2", role: "assistant", parts: [] },
            sessionId: "ss_0123456789abcdef",
          })
        )
      ).status
    ).toBe(400);
    expect(resources.decideToolApproval).not.toHaveBeenCalled();
    expect(client.chat).not.toHaveBeenCalled();
  });
});
