import type { ChatTransport, UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlazingAgentsDirectChatTransport } from "./direct-chat-transport.ts";
import { sseStream } from "./test/fixtures.ts";
import {
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

  it("decodes native SSE without constructing Response and retains early Session identity", async () => {
    const NativeResponse = globalThis.Response;
    const requests: { url: string; body: unknown; signal: unknown }[] = [];
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        signal: init?.signal,
      });
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
      client: client(fetch),
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
        body: { message, trigger: "submit-message" },
        signal: controller.signal,
      },
      {
        url: `http://localhost:8787/v1/agents/${agentId}/sessions/${mintedSessionId}`,
        body: {
          message,
          messageId: "assistant-1",
          trigger: "regenerate-message",
        },
        signal: undefined,
      },
    ]);
    await expect(
      transport.reconnectToStream({ chatId: "local-chat" })
    ).resolves.toBeNull();
  });

  it.each([chatErrorChunks, chatAbortChunks])(
    "preserves streamed error and abort chunks",
    async (...chunks) => {
      const transport = new BlazingAgentsDirectChatTransport({
        agentId,
        client: client(() => Promise.resolve(new Response(sseStream(chunks)))),
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
      client: client(() =>
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
      client: client(fetch),
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
        client: client(() =>
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
      client: client(fetch),
    });
    await expect(
      transport.sendMessages({ ...input, messages: [] })
    ).rejects.toThrow("requires a user message");
    await expect(
      transport.sendMessages({ ...input, trigger: "regenerate-message" })
    ).rejects.toThrow("requires an existing Session");
    expect(fetch).not.toHaveBeenCalled();
    expect(
      () =>
        new BlazingAgentsDirectChatTransport({
          agentId,
          client: client(fetch),
          sessionId: "invalid",
        })
    ).toThrow();
  });

  it("preserves typed request cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = new BlazingAgentsDirectChatTransport({
      agentId,
      client: client(() =>
        Promise.reject(new DOMException("Aborted", "AbortError"))
      ),
    });
    await expect(
      transport.sendMessages({ ...input, abortSignal: controller.signal })
    ).rejects.toMatchObject({ code: "request_aborted" });
  });
});
