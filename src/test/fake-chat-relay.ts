import { expect, vi } from "vitest";
import {
  BlazingAgentsChat,
  type BlazingAgentsChatOptions,
  type BlazingAgentsUIMessage,
} from "../index.ts";

export const sessionId = "ss_0123456789abcdef";
export const sessionLocation = `/v1/agents/ag_0123456789abcdef/sessions/${sessionId}`;

export interface RelayCall {
  body: Record<string, unknown>;
  /** Fails the request in transit, as a dropped connection does. */
  fail(): void;
  headers: Headers;
  respond(response: Response): void;
}

/**
 * The app's relay as the browser sees it: every request waits until the test
 * answers it, so a test can inspect what the chat sent before replying.
 */
export function fakeRelay() {
  const calls: RelayCall[] = [];
  let read = 0;
  const fetch = (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const abort = () =>
        reject(new DOMException("The request was aborted.", "AbortError"));
      // As fetch does, an aborted signal sends nothing.
      if (init?.signal?.aborted) {
        abort();
        return;
      }
      init?.signal?.addEventListener("abort", abort);
      calls.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        fail: () => reject(new TypeError("Failed to fetch")),
        headers: new Headers(init?.headers),
        respond: resolve,
      });
    });
  return {
    calls,
    fetch,
    /** The next unanswered request, which must carry `op`. */
    async next(op: "chat" | "history" | "steer"): Promise<RelayCall> {
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(read));
      const call = calls[read];
      read += 1;
      expect(call.body.op).toBe(op);
      return call;
    },
    /** Requests not answered through `next` yet. */
    unread: () => calls.slice(read),
  };
}

const startedChats: BlazingAgentsChat<BlazingAgentsUIMessage>[] = [];

/** A started `BlazingAgentsChat` over the fake relay, disposed by `disposeChats`. */
export function startChat(
  relay: { fetch: typeof globalThis.fetch },
  options: BlazingAgentsChatOptions = {}
): BlazingAgentsChat {
  const chat = new BlazingAgentsChat({ fetch: relay.fetch, ...options });
  startedChats.push(chat);
  chat.start();
  return chat;
}

/** Disposes every chat `startChat` started; run after each test. */
export function disposeChats(): void {
  for (const chat of startedChats.splice(0)) {
    chat.dispose();
  }
}

/** A `localStorage` stand-in, since Node has none. */
export function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** A chat response whose SSE stream stays open until `close`. */
export function liveStream(headers: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  return {
    response: new Response(body, {
      headers: { "content-type": "text/event-stream", ...headers },
    }),
    push(...chunks: unknown[]) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
        );
      }
    },
    close() {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
    /** Drops the connection mid-stream. */
    fail() {
      controller.error(new TypeError("network error"));
    },
  };
}

/** The chunks of one assistant reply holding `text`. */
export function reply(messageId: string, text: string): unknown[] {
  return [
    { type: "start", messageId },
    { type: "start-step" },
    { type: "text-start", id: `${messageId}-text` },
    { type: "text-delta", id: `${messageId}-text`, delta: text },
    { type: "text-end", id: `${messageId}-text` },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
}

export function userMessage(id: string, text: string) {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

export function assistantMessage(id: string, text: string) {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

export function historyPage(data: unknown[], nextCursor: string | null = null) {
  return Response.json({ data, nextCursor });
}

export function relayError(status: number, code: string) {
  return Response.json(
    { error: { code, message: `${code} message.` } },
    { status }
  );
}

/** Each message as `role: text`, which is what a chat UI renders. */
export function transcript(
  messages: readonly {
    parts: readonly { text?: string; type: string }[];
    role: string;
  }[]
): string[] {
  return messages.map(
    (message) =>
      `${message.role}: ${message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")}`
  );
}

/** The transient chunk a running Turn emits when it reads a steer. */
export function steerConsumed(requestId: string, text: string): unknown {
  return {
    type: "data-ba-steer-consumed",
    transient: true,
    data: {
      requestId,
      turnId: "turn_0123456789abcdef",
      sequence: 1,
      message: {
        id: `stored-${requestId}`,
        role: "user",
        parts: [{ type: "text", text }],
      },
    },
  };
}

/** A reply that ends asking for one Tool approval; `answered` streams the decision too. */
export function approvalReply(messageId: string, answered: boolean): unknown[] {
  return [
    { type: "start", messageId },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "getOrder",
      input: { orderId: "o1" },
    },
    {
      type: "tool-approval-request",
      approvalId: "approval-1",
      toolCallId: "call-1",
    },
    ...(answered
      ? [
          {
            type: "tool-approval-response",
            approvalId: "approval-1",
            approved: true,
          },
        ]
      : []),
    { type: "finish-step" },
    { type: "finish", finishReason: "tool-calls" },
  ];
}
