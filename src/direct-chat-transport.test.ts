import type { ChatTransport, UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BlazingAgents } from "./client.ts";
import { BlazingAgentsDirectChatTransport } from "./direct-chat-transport.ts";
import { defineFunction } from "./functions.ts";
import { sseStream } from "./test/fixtures.ts";
import {
  BASE,
  chatAbortChunks,
  chatChunks,
  chatErrorChunks,
  client,
  createLocation,
  mintedSessionId,
} from "./test/generation-fixtures.ts";

const message: UIMessage = {
  id: "original-user-message",
  parts: [{ type: "text", text: "Hello" }],
  role: "user",
};
const input: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0] = {
  abortSignal: undefined,
  chatId: "local-chat",
  messageId: undefined,
  messages: [message],
  trigger: "submit-message",
};
const agentId = "ag_0123456789abcdef";

async function collect(stream: ReadableStream) {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("BlazingAgentsDirectChatTransport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sendUserMessages decodes chat SSE using native streaming fetch", async () => {
    const NativeResponse = globalThis.Response;
    const fetch = vi.fn(() =>
      Promise.resolve(new NativeResponse(sseStream(chatChunks)))
    );
    vi.stubGlobal(
      "Response",
      class {
        constructor() {
          throw new Error("Native Response cannot wrap a stream");
        }
      }
    );
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      sessionId: mintedSessionId,
      getClient: () => client(fetch),
    });
    const abortSignal = new AbortController().signal;
    const stream = await transport.sendUserMessages({
      messages: [message],
      abortSignal,
    });
    expect(await collect(stream)).toEqual(chatChunks);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/v1/agents/${agentId}/sessions/${mintedSessionId}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ messages: [message] }),
        signal: abortSignal,
      })
    );
  });

  it("decodes native SSE without constructing Response and retains early Session identity", async () => {
    const NativeResponse = globalThis.Response;
    const requests: { url: string; body: unknown; signal: unknown }[] = [];
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
        signal: init?.signal,
      });
      if (String(url).endsWith("/tool-approvals")) {
        return Promise.resolve(
          new NativeResponse(JSON.stringify({ data: [], continuation: null }), {
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new NativeResponse(sseStream(chatChunks), {
          status: 201,
          headers: { location: createLocation },
        })
      );
    });
    vi.stubGlobal(
      "Response",
      class {
        constructor() {
          throw new Error("Native Response cannot wrap a stream");
        }
      }
    );
    const onSessionId = vi.fn();
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () => client(fetch),
      onSessionId,
    });
    const controller = new AbortController();
    const stream = await transport.sendMessages({
      ...input,
      abortSignal: controller.signal,
    });
    expect(onSessionId).toHaveBeenCalledWith(mintedSessionId);
    expect(await collect(stream)).toEqual(chatChunks);
    await collect(
      await transport.sendMessages({
        ...input,
        messages: [
          message,
          { id: "assistant-1", role: "assistant", parts: [] },
        ],
        messageId: "assistant-1",
        trigger: "regenerate-message",
      })
    );
    expect(onSessionId).toHaveBeenCalledOnce();
    expect(requests).toEqual([
      {
        url: `http://localhost:8787/v1/agents/${agentId}/sessions`,
        body: { messages: [message], trigger: "submit-message" },
        signal: controller.signal,
      },
      {
        url: `http://localhost:8787/v1/agents/${agentId}/sessions/${mintedSessionId}`,
        body: {
          messages: [message],
          messageId: "assistant-1",
          trigger: "regenerate-message",
        },
        signal: undefined,
      },
    ]);
    await expect(
      transport.reconnectToStream({ chatId: "local-chat" })
    ).resolves.toBeNull();
    expect(requests).toHaveLength(2);
  });

  it.each([chatErrorChunks, chatAbortChunks])(
    "preserves streamed error and abort chunks",
    async (...chunks) => {
      const transport = new BlazingAgentsDirectChatTransport({
        agentId,
        getClient: () =>
          client(() => Promise.resolve(new Response(sseStream(chunks)))),
        sessionId: mintedSessionId,
      });
      expect(await collect(await transport.sendMessages(input))).toEqual(
        chunks
      );
    }
  );

  it("creates a Session without an identity callback", async () => {
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () =>
        client(() =>
          Promise.resolve(
            new Response(sseStream(chatChunks), {
              headers: { location: createLocation },
            })
          )
        ),
    });
    expect(await collect(await transport.sendMessages(input))).toEqual(
      chatChunks
    );
  });

  it("uses an explicit Session after switching chats", async () => {
    const fetch = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(sseStream(chatChunks)))
    );
    const onSessionId = vi.fn();
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () => client(fetch),
      sessionId: mintedSessionId,
      onSessionId,
    });
    await collect(await transport.sendMessages(input));
    expect(String(fetch.mock.calls[0]?.[0])).toContain(mintedSessionId);
    expect(onSessionId).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "cancels the body when Session identity or persistence fails (%s)",
    async (validLocation) => {
      const cancel = vi.fn(() => Promise.reject(new Error("cancel failed")));
      const transport = new BlazingAgentsDirectChatTransport({
        agentId,
        getClient: () =>
          client(() =>
            Promise.resolve(
              new Response(new ReadableStream({ cancel }), {
                headers: validLocation ? { location: createLocation } : {},
              })
            )
          ),
        onSessionId: () => Promise.reject(new Error("persistence failed")),
      });
      await expect(transport.sendMessages(input)).rejects.toThrow();
      expect(cancel).toHaveBeenCalledOnce();
    }
  );

  it("rejects invalid submissions before fetching", async () => {
    const fetch = vi.fn();
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () => client(fetch),
    });
    await expect(
      transport.sendMessages({ ...input, messages: [] })
    ).rejects.toThrow("requires a user message");
    await expect(
      transport.sendMessages({ ...input, trigger: "regenerate-message" })
    ).rejects.toThrow("requires an existing Session");
    await expect(
      transport.reconnectToStream({ chatId: "local-chat" })
    ).resolves.toBeNull();
    const resumed = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () => client(fetch),
      sessionId: mintedSessionId,
    });
    await expect(
      resumed.sendMessages({ ...input, messages: [] })
    ).rejects.toThrow("requires a user message");
    expect(fetch).not.toHaveBeenCalled();
    expect(
      () =>
        new BlazingAgentsDirectChatTransport({
          agentId,
          getClient: () => client(fetch),
          sessionId: "invalid",
        })
    ).toThrow();
  });

  it("preserves typed request cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () =>
        client(() => Promise.reject(new DOMException("Aborted", "AbortError"))),
    });
    await expect(
      transport.sendMessages({ ...input, abortSignal: controller.signal })
    ).rejects.toMatchObject({ code: "request_aborted" });
  });

  it("sends create options once and gets a fresh client for each Turn", async () => {
    const requests: {
      body: unknown;
      authorization: string | null;
      url: string;
    }[] = [];
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        body: JSON.parse(String(init?.body)),
        authorization: new Headers(init?.headers).get("authorization"),
        url: String(url),
      });
      return Promise.resolve(
        new Response(sseStream(chatChunks), {
          headers: { location: createLocation },
        })
      );
    });
    let apiKey = "first";
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () => new BlazingAgents({ apiKey, baseUrl: BASE, fetch }),
      userId: "user-1",
      metadata: { source: "playground" },
    });
    expect(await collect(await transport.sendMessages(input))).toEqual(
      chatChunks
    );
    apiKey = "second";
    expect(await collect(await transport.sendMessages(input))).toEqual(
      chatChunks
    );
    expect(requests).toEqual([
      {
        url: `${BASE}/v1/agents/${agentId}/sessions`,
        authorization: "Bearer first",
        body: {
          messages: [message],
          trigger: "submit-message",
          userId: "user-1",
          metadata: { source: "playground" },
        },
      },
      {
        url: `${BASE}/v1/agents/${agentId}/sessions/${mintedSessionId}`,
        authorization: "Bearer second",
        body: { messages: [message], trigger: "submit-message" },
      },
    ]);
  });

  it("creates from a stored Prompt without sending the useChat user message", async () => {
    const bodies: unknown[] = [];
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () =>
        client((_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Promise.resolve(
            new Response(sseStream(chatChunks), {
              headers: { location: createLocation },
            })
          );
        }),
      promptId: "prompt_0123456789abcdef",
      variables: { topic: "release" },
    });
    expect(await collect(await transport.sendMessages(input))).toEqual(
      chatChunks
    );
    expect(bodies).toEqual([
      {
        promptId: "prompt_0123456789abcdef",
        variables: { topic: "release" },
        trigger: "submit-message",
      },
    ]);
  });

  it("decides approval responses in order and streams the continuation", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      requests.push({
        url: path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Promise.resolve(new Response(sseStream(chatChunks)));
    });
    const getClient = vi.fn(() => client(fetch));
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient,
      sessionId: mintedSessionId,
    });
    const assistant: UIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "dynamic-tool",
          toolName: "bash",
          toolCallId: "old-call",
          state: "approval-responded",
          input: {},
          approval: { id: "old-approval", approved: true },
        },
        { type: "step-start" },
        {
          type: "dynamic-tool",
          toolName: "bash",
          toolCallId: "finished-call",
          state: "output-available",
          input: {},
          output: "done",
        },
        {
          type: "dynamic-tool",
          toolName: "bash",
          toolCallId: "call-1",
          state: "approval-responded",
          input: { command: "ls" },
          approval: { id: "approval-1", approved: true },
        },
        {
          type: "tool-bash",
          toolCallId: "call-2",
          state: "approval-responded",
          input: { command: "rm" },
          approval: {
            id: "approval-2",
            approved: false,
            reason: "Keep it",
          },
        },
      ],
    };
    expect(
      await collect(
        await transport.sendMessages({
          ...input,
          messages: [message, assistant],
        })
      )
    ).toEqual(chatChunks);
    const base = `${BASE}/v1/agents/${agentId}/sessions/${mintedSessionId}`;
    expect(requests).toEqual([
      {
        url: `${base}/tool-approvals/continue`,
        body: {
          functions: {},
          decisions: [
            { approvalId: "approval-1", approved: true },
            { approvalId: "approval-2", approved: false, reason: "Keep it" },
          ],
        },
      },
    ]);
    expect(getClient).toHaveBeenCalledOnce();
  });

  it("sends functions and resumes approved continuations with handlers", async () => {
    const requests: { method: string; url: string; body: unknown }[] = [];
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      requests.push({
        method: init?.method ?? "GET",
        url: path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Promise.resolve(
        new Response(sseStream(chatChunks), {
          headers: { location: createLocation },
        })
      );
    });
    const functions = {
      getOrder: defineFunction({
        description: "Get an order",
        inputSchema: z.object({ orderId: z.string() }),
        execute: () => null,
      }),
    };
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      functions,
      getClient: () => client(fetch),
      sessionId: mintedSessionId,
    });
    await collect(await transport.sendMessages(input));
    expect(requests[0].body).toMatchObject({
      functions: { getOrder: { description: "Get an order" } },
    });

    requests.length = 0;
    expect(
      await collect(
        await transport.sendMessages({
          ...input,
          messages: [
            message,
            {
              id: "assistant-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolName: "getOrder",
                  toolCallId: "call-1",
                  state: "approval-responded",
                  input: { orderId: "o1" },
                  approval: { id: "approval-1", approved: true },
                },
              ],
            },
          ],
        })
      )
    ).toEqual(chatChunks);
    const base = `${BASE}/v1/agents/${agentId}/sessions/${mintedSessionId}`;
    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `POST ${base}/tool-approvals/continue`,
    ]);

    requests.length = 0;
    const stream = await transport.reconnectToStream({ chatId: "local-chat" });
    expect(stream).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it("requires a Session before deciding an approval", async () => {
    const fetch = vi.fn();
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient: () => client(fetch),
    });
    await expect(
      transport.sendMessages({
        ...input,
        messages: [
          message,
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "bash",
                toolCallId: "call-1",
                state: "approval-responded",
                input: {},
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
        ],
      })
    ).rejects.toThrow("requires an existing Session");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not acquire a client or fetch when reconnecting", async () => {
    const fetch = vi.fn();
    const getClient = vi.fn(() => client(fetch));
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      getClient,
      sessionId: mintedSessionId,
    });
    await expect(
      transport.reconnectToStream({ chatId: "local-chat" })
    ).resolves.toBeNull();
    expect(getClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
