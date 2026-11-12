// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Activity, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlazingAgentsError } from "../index.ts";
import {
  assistantMessage,
  fakeRelay,
  historyPage,
  liveStream,
  relayError,
  reply,
  sessionId,
  sessionLocation,
  transcript,
  userMessage,
} from "../test/fake-chat-relay.ts";
import { type BlazingAgentsChat, useBlazingAgentsChat } from "./index.ts";

const STORAGE_KEY = "blazing-agents-session";
const stored = [
  userMessage("user-1", "Hello"),
  assistantMessage("reply-1", "Hi there"),
];

// Node's own localStorage global shadows happy-dom's, so give each test a fresh one.
beforeEach(() => vi.stubGlobal("localStorage", new Storage()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useBlazingAgentsChat Sessions", () => {
  it("restores the stored transcript after a remount", async () => {
    const relay = fakeRelay();
    const first = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch })
    );
    await waitFor(() => expect(first.result.current.status).toBe("idle"));
    let sent!: Promise<boolean>;
    act(() => {
      sent = first.result.current.send("Hello");
    });
    const stream = liveStream({ location: sessionLocation });
    (await relay.next("chat")).respond(stream.response);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await sent).toBe(true);
    first.unmount();

    const { result } = renderHook(
      () => useBlazingAgentsChat({ fetch: relay.fetch }),
      { reactStrictMode: true }
    );
    expect(result.current.status).toBe("restoring");
    // StrictMode mounts twice; only the second mount's answer may show.
    const discarded = await relay.next("history");
    const history = await relay.next("history");
    discarded.respond(historyPage([userMessage("user-0", "Stale")]));
    expect(history.body).toEqual({ op: "history", sessionId });
    history.respond(historyPage(stored));

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(result.current.sessionId).toBe(sessionId);
    expect(result.current.canRegenerate).toBe(true);
  });

  it("forgets a Session the relay answers 404 for, and sends a message queued meanwhile on a new one", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const { result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch })
    );
    const history = await relay.next("history");
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.send("Hello");
    });
    expect(relay.unread()).toEqual([]);

    history.respond(relayError(404, "not_found"));

    const chat = await relay.next("chat");
    expect(chat.body).not.toHaveProperty("sessionId");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.error).toBeUndefined();
    const stream = liveStream({ location: sessionLocation });
    chat.respond(stream.response);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await sent).toBe(true);
  });

  it("forgets a Session the relay answers 404 for on chat, and shows a BlazingAgentsError", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const { result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch })
    );
    (await relay.next("history")).respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.send("Again");
    });
    const chat = await relay.next("chat");
    expect(chat.body).toMatchObject({ sessionId });

    chat.respond(relayError(404, "not_found"));

    expect(await sent).toBe(false);
    await waitFor(() => expect(result.current.sessionId).toBeUndefined());
    expect(BlazingAgentsError.isInstance(result.current.error)).toBe(true);
    expect(result.current.error).toMatchObject({
      code: "not_found",
      status: 404,
    });
    expect(result.current.messages).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    act(() => {
      result.current.send("Fresh start");
    });
    expect((await relay.next("chat")).body).not.toHaveProperty("sessionId");
  });

  it("reads history again once the headers carry new credentials after a 401", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const { rerender, result } = renderHook(
      ({ token }) =>
        useBlazingAgentsChat({
          fetch: relay.fetch,
          headers: { authorization: `Bearer ${token}` },
        }),
      { initialProps: { token: "expired" } }
    );
    const refused = await relay.next("history");
    expect(refused.headers.get("authorization")).toBe("Bearer expired");
    refused.respond(relayError(401, "unauthorized"));
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: "unauthorized" })
    );
    expect(result.current.status).toBe("restoring");

    rerender({ token: "expired" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
    rerender({ token: "fresh" });

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(result.current.error).toBeUndefined();
    rerender({ token: "rotated" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
  });

  it("reads history again when the credentials changed while the first read was failing", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const { rerender, result } = renderHook(
      ({ token }) =>
        useBlazingAgentsChat({
          fetch: relay.fetch,
          headers: { authorization: `Bearer ${token}` },
        }),
      { initialProps: { token: "" } }
    );
    const refused = await relay.next("history");
    rerender({ token: "fresh" });
    refused.respond(relayError(401, "unauthorized"));

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.error).toBeUndefined();
  });

  it.each([
    ["send()", (chat: BlazingAgentsChat) => chat.send("Again"), ["chat"]],
    ["clearError()", (chat: BlazingAgentsChat) => chat.clearError(), []],
  ])(
    "reads history again on %s after the restore failed",
    async (_, retry, after) => {
      localStorage.setItem(STORAGE_KEY, sessionId);
      const relay = fakeRelay();
      const { result } = renderHook(() =>
        useBlazingAgentsChat({ fetch: relay.fetch })
      );
      (await relay.next("history")).respond(relayError(500, "internal_error"));
      await waitFor(() =>
        expect(result.current.error).toMatchObject({ code: "internal_error" })
      );
      expect(result.current.status).toBe("restoring");

      act(() => {
        retry(result.current);
      });

      const retried = await relay.next("history");
      expect(result.current.error).toBeUndefined();
      retried.respond(historyPage(stored));
      await waitFor(() =>
        expect(transcript(result.current.messages).slice(0, 2)).toEqual([
          "user: Hello",
          "assistant: Hi there",
        ])
      );
      await waitFor(() =>
        expect(relay.unread().map((call) => call.body)).toEqual(
          after.map((op) => expect.objectContaining({ op, sessionId }))
        )
      );
    }
  );

  it("New Session cancels the running Turn, forgets the Session, and starts the next send without one", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const { result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch })
    );
    (await relay.next("history")).respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    let running!: Promise<boolean>;
    act(() => {
      running = result.current.send("Keep going");
    });
    (await relay.next("chat")).respond(liveStream().response);
    await waitFor(() => expect(result.current.status).toBe("running"));

    act(() => result.current.newSession());

    expect(await running).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    act(() => {
      result.current.send("Fresh start");
    });
    expect((await relay.next("chat")).body).not.toHaveProperty("sessionId");
  });

  it("cancels the running Turn and resolves its send false on unmount", async () => {
    const relay = fakeRelay();
    const { result, unmount } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch })
    );
    await waitFor(() => expect(result.current.status).toBe("idle"));
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.send("Hello");
    });
    await relay.next("chat");

    unmount();

    expect(await sent).toBe(false);
  });

  it.each([
    ["storageKey is null", { storageKey: null }, STORAGE_KEY],
    ["the stored value is not a Session ID", {}, "not-a-session"],
  ])("starts without a stored Session when %s", async (_, options, key) => {
    localStorage.setItem(STORAGE_KEY, key === STORAGE_KEY ? sessionId : key);
    const relay = fakeRelay();
    const { result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch, ...options })
    );

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(relay.calls).toEqual([]);
    expect(result.current.sessionId).toBeUndefined();
  });

  it("keeps the Session in memory when localStorage throws on get, set, and remove", async () => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      removeItem: blocked,
      setItem: blocked,
    });
    const relay = fakeRelay();
    let mode: "hidden" | "visible" = "visible";
    const { rerender, result } = renderHook(
      () => useBlazingAgentsChat({ fetch: relay.fetch }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(Activity, { children, mode }),
      }
    );
    await waitFor(() => expect(result.current.status).toBe("idle"));
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.send("Hello");
    });
    const stream = liveStream({ location: sessionLocation });
    (await relay.next("chat")).respond(stream.response);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await sent).toBe(true);
    expect(result.current.sessionId).toBe(sessionId);

    mode = "hidden";
    rerender();
    mode = "visible";
    rerender();

    const history = await relay.next("history");
    expect(history.body).toEqual({ op: "history", sessionId });
    history.respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    act(() => result.current.newSession());
    expect(result.current.sessionId).toBeUndefined();
  });

  it("keeps a Session in memory only when storageKey is null", async () => {
    const relay = fakeRelay();
    const { result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch, storageKey: null })
    );
    await waitFor(() => expect(result.current.status).toBe("idle"));
    act(() => {
      result.current.send("Hello");
    });
    (await relay.next("chat")).respond(
      liveStream({ location: sessionLocation }).response
    );

    await waitFor(() => expect(result.current.sessionId).toBe(sessionId));
    expect(localStorage.length).toBe(0);
    act(() => result.current.newSession());
    expect(result.current.sessionId).toBeUndefined();
  });
});
