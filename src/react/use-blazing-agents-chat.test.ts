// @vitest-environment happy-dom
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantMessage,
  fakeRelay,
  historyPage,
  liveStream,
  memoryStorage,
  relayError,
  reply,
  sessionId,
  sessionLocation,
  transcript,
  userMessage,
} from "../test/fake-chat-relay.ts";
import {
  type UseBlazingAgentsChatResult,
  useBlazingAgentsChat,
} from "./index.ts";

const STORAGE_KEY = "blazing-agents-session";
const stored = [
  userMessage("user-1", "Hello"),
  assistantMessage("reply-1", "Hi there"),
];

// Node's own localStorage global shadows happy-dom's, so give each test a fresh one.
beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useBlazingAgentsChat", () => {
  it("starts after each StrictMode mount, shows only the last restore, and cancels the Turn on unmount", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const { result, unmount } = renderHook(
      () => useBlazingAgentsChat({ fetch: relay.fetch }),
      { reactStrictMode: true }
    );
    expect(result.current.status).toBe("restoring");
    const discarded = await relay.next("history");
    const history = await relay.next("history");
    discarded.respond(historyPage([userMessage("user-0", "Stale")]));
    history.respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.send("Again");
    });
    await relay.next("chat");

    unmount();

    expect(await sent).toBe(false);
  });

  it("sends nothing when re-rendered with equal headers, and reads history again with new ones", async () => {
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
    (await relay.next("history")).respond(relayError(401, "unauthorized"));
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: "unauthorized" })
    );
    const failed = result.current;

    rerender({ token: "expired" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
    expect(result.current).toBe(failed);
    rerender({ token: "fresh" });

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.error).toBeUndefined();
  });

  it("steers with the token of the same commit when a child's effect sends", async () => {
    const relay = fakeRelay();
    let chat!: UseBlazingAgentsChatResult;
    function Composer({
      send,
      token,
    }: {
      send: UseBlazingAgentsChatResult["send"];
      token: string;
    }) {
      useEffect(() => {
        if (token === "fresh") {
          send("Also this");
        }
      }, [send, token]);
      return null;
    }
    function Chat({ token }: { token: string }) {
      chat = useBlazingAgentsChat({
        fetch: relay.fetch,
        headers: { authorization: `Bearer ${token}` },
      });
      return createElement(Composer, { send: chat.send, token });
    }
    const { rerender } = render(createElement(Chat, { token: "expired" }));
    await waitFor(() => expect(chat.status).toBe("idle"));
    act(() => {
      chat.send("Hello");
    });
    const stream = liveStream({ location: sessionLocation });
    (await relay.next("chat")).respond(stream.response);
    stream.push(...reply("reply-1", "Hi there").slice(0, 4));
    await waitFor(() =>
      expect(transcript(chat.messages)).toContain("assistant: Hi there")
    );

    rerender(createElement(Chat, { token: "fresh" }));

    const steer = await relay.next("steer");
    expect(steer.headers.get("authorization")).toBe("Bearer fresh");
  });

  it("reads history again when a Headers object changed in place after a failed restore", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const headers = new Headers({ authorization: "Bearer expired" });
    const { rerender, result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch, headers })
    );
    (await relay.next("history")).respond(relayError(401, "unauthorized"));
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: "unauthorized" })
    );

    headers.set("authorization", "Bearer fresh");
    rerender();

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.error).toBeUndefined();
  });

  it("renders the sent message, the streaming reply, and the minted Session", async () => {
    const relay = fakeRelay();
    const { result } = renderHook(() =>
      useBlazingAgentsChat({ fetch: relay.fetch })
    );
    await waitFor(() => expect(result.current.status).toBe("idle"));

    act(() => {
      result.current.send("Hello");
    });
    expect(transcript(result.current.messages)).toEqual(["user: Hello"]);
    expect(result.current.pendingIds.size).toBe(1);
    const stream = liveStream({ location: sessionLocation });
    (await relay.next("chat")).respond(stream.response);
    const chunks = reply("reply-1", "Hi there");
    stream.push(...chunks.slice(0, 4));
    await waitFor(() =>
      expect(transcript(result.current.messages)).toEqual([
        "user: Hello",
        "assistant: Hi there",
      ])
    );
    expect(result.current.status).toBe("running");
    stream.push(...chunks.slice(4));
    stream.close();

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.sessionId).toBe(sessionId);
    expect(result.current.canRegenerate).toBe(true);
    expect(result.current.pendingIds.size).toBe(0);
    act(() => result.current.newSession());
    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBeUndefined();
  });
});
