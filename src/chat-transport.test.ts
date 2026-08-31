import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlazingAgentsChatTransport } from "./index.ts";
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
        message: firstMessage,
        trigger: "submit-message",
      },
      {
        locale: "en-GB",
        message: secondMessage,
        sessionId: "ss_0123456789abcdef",
        trigger: "submit-message",
      },
    ]);
    expect(onSessionId).toHaveBeenCalledOnce();
    expect(onSessionId).toHaveBeenCalledWith("ss_0123456789abcdef");
  });

  it("resumes from an authorized initial Session ID after a reload", async () => {
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
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
});
