import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlazingAgentsChat, BlazingAgentsError } from "./index.ts";
import {
  assistantMessage,
  disposeChats,
  fakeRelay,
  historyPage,
  liveStream,
  memoryStorage,
  relayError,
  reply,
  sessionId,
  sessionLocation,
  startChat,
  transcript,
  userMessage,
} from "./test/fake-chat-relay.ts";

const STORAGE_KEY = "blazing-agents-session";
const stored = [
  userMessage("user-1", "Hello"),
  assistantMessage("reply-1", "Hi there"),
];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
  disposeChats();
  vi.unstubAllGlobals();
});

describe("BlazingAgentsChat Sessions", () => {
  it("touches neither storage nor the network before start()", async () => {
    const read = vi.fn(() => {
      throw new Error("storage read during construction");
    });
    vi.stubGlobal("localStorage", { getItem: read });
    const relay = fakeRelay();

    const chat = new BlazingAgentsChat({ fetch: relay.fetch });

    expect(chat.getSnapshot()).toEqual({
      canRegenerate: false,
      error: undefined,
      messages: [],
      pendingIds: new Set(),
      sessionId: undefined,
      status: "restoring",
    });
    await settle();
    expect(read).not.toHaveBeenCalled();
    expect(relay.calls).toEqual([]);
  });

  it("restores the stored transcript after a restart, ignoring the answer to a disposed start", async () => {
    const relay = fakeRelay();
    const first = startChat(relay);
    await vi.waitFor(() => expect(first.getSnapshot().status).toBe("idle"));
    const sent = first.send("Hello");
    const stream = liveStream({ location: sessionLocation });
    (await relay.next("chat")).respond(stream.response);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await sent).toBe(true);
    first.dispose();

    const chat = startChat(relay);
    chat.dispose();
    chat.start();
    expect(chat.getSnapshot().status).toBe("restoring");
    const discarded = await relay.next("history");
    const history = await relay.next("history");
    discarded.respond(historyPage([userMessage("user-0", "Stale")]));
    expect(history.body).toEqual({ op: "history", sessionId });
    history.respond(historyPage(stored));

    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(chat.getSnapshot().sessionId).toBe(sessionId);
    expect(chat.getSnapshot().canRegenerate).toBe(true);
  });

  it("restores once when start() is called twice", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay);

    chat.start();

    (await relay.next("history")).respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(relay.calls).toHaveLength(1);
  });

  it("keeps the snapshot and calls no listener when nothing changed, and stops calling one that unsubscribed", async () => {
    const relay = fakeRelay();
    const chat = startChat(relay);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    const listener = vi.fn();
    const unsubscribe = chat.subscribe(listener);
    const idle = chat.getSnapshot();

    chat.regenerate();
    chat.stop();
    chat.clearError();
    chat.setHeaders(undefined);

    expect(chat.getSnapshot()).toBe(idle);
    expect(listener).not.toHaveBeenCalled();
    chat.send("Hello");
    expect(listener).toHaveBeenCalled();
    expect(chat.getSnapshot()).not.toBe(idle);
    expect(chat.getSnapshot().status).toBe("running");
    unsubscribe();
    listener.mockClear();
    chat.stop();
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("forgets a Session the relay answers 404 for, and sends a message queued meanwhile on a new one", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay);
    const history = await relay.next("history");
    const sent = chat.send("Hello");
    expect(relay.unread()).toEqual([]);

    history.respond(relayError(404, "not_found"));

    const request = await relay.next("chat");
    expect(request.body).not.toHaveProperty("sessionId");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(chat.getSnapshot().error).toBeUndefined();
    const stream = liveStream({ location: sessionLocation });
    request.respond(stream.response);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await sent).toBe(true);
  });

  it("forgets a Session the relay answers 404 for on chat, and shows a BlazingAgentsError", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay);
    (await relay.next("history")).respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    const sent = chat.send("Again");
    const request = await relay.next("chat");
    expect(request.body).toMatchObject({ sessionId });

    request.respond(relayError(404, "not_found"));

    expect(await sent).toBe(false);
    await vi.waitFor(() =>
      expect(chat.getSnapshot().sessionId).toBeUndefined()
    );
    expect(BlazingAgentsError.isInstance(chat.getSnapshot().error)).toBe(true);
    expect(chat.getSnapshot().error).toMatchObject({
      code: "not_found",
      status: 404,
    });
    expect(chat.getSnapshot().messages).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    chat.send("Fresh start");
    expect((await relay.next("chat")).body).not.toHaveProperty("sessionId");
  });

  it("reads history again once the headers carry new credentials after a 401", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay, {
      headers: { authorization: "Bearer expired" },
    });
    const refused = await relay.next("history");
    expect(refused.headers.get("authorization")).toBe("Bearer expired");
    refused.respond(relayError(401, "unauthorized"));
    await vi.waitFor(() =>
      expect(chat.getSnapshot().error).toMatchObject({ code: "unauthorized" })
    );
    expect(chat.getSnapshot().status).toBe("restoring");

    chat.setHeaders({ authorization: "Bearer expired" });
    await settle();
    expect(relay.unread()).toEqual([]);
    chat.setHeaders(new Headers({ authorization: "Bearer fresh" }));

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(chat.getSnapshot().error).toBeUndefined();
    chat.setHeaders({ authorization: "Bearer rotated" });
    await settle();
    expect(relay.unread()).toEqual([]);
  });

  it("reads history again when the credentials changed while the first read was failing", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay, { headers: { authorization: "Bearer " } });
    const refused = await relay.next("history");
    chat.setHeaders({ authorization: "Bearer fresh" });
    refused.respond(relayError(401, "unauthorized"));

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(chat.getSnapshot().error).toBeUndefined();
  });

  it("reads history again once setHeaders sees new values in the same Headers object, and reads a headers function at each request", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const headers = new Headers({ authorization: "Bearer expired" });
    const chat = startChat(relay, { headers });
    (await relay.next("history")).respond(relayError(401, "unauthorized"));
    await vi.waitFor(() =>
      expect(chat.getSnapshot().error).toMatchObject({ code: "unauthorized" })
    );

    headers.set("authorization", "Bearer fresh");
    chat.setHeaders(headers);

    const retried = await relay.next("history");
    expect(retried.headers.get("authorization")).toBe("Bearer fresh");
    retried.respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    let token = "rotated";
    chat.setHeaders(() => ({ authorization: `Bearer ${token}` }));
    token = "latest";
    chat.send("Again");
    expect((await relay.next("chat")).headers.get("authorization")).toBe(
      "Bearer latest"
    );
  });

  it.each([
    ["send()", (chat: BlazingAgentsChat) => chat.send("Again"), ["chat"]],
    ["clearError()", (chat: BlazingAgentsChat) => chat.clearError(), []],
  ])(
    "reads history again on %s after the restore failed",
    async (_, retry, after) => {
      localStorage.setItem(STORAGE_KEY, sessionId);
      const relay = fakeRelay();
      const chat = startChat(relay);
      (await relay.next("history")).respond(relayError(500, "internal_error"));
      await vi.waitFor(() =>
        expect(chat.getSnapshot().error).toMatchObject({
          code: "internal_error",
        })
      );
      expect(chat.getSnapshot().status).toBe("restoring");

      retry(chat);

      const retried = await relay.next("history");
      expect(chat.getSnapshot().error).toBeUndefined();
      retried.respond(historyPage(stored));
      await vi.waitFor(() =>
        expect(transcript(chat.getSnapshot().messages).slice(0, 2)).toEqual([
          "user: Hello",
          "assistant: Hi there",
        ])
      );
      await vi.waitFor(() =>
        expect(relay.unread().map((call) => call.body)).toEqual(
          after.map((op) => expect.objectContaining({ op, sessionId }))
        )
      );
    }
  );

  it("New Session cancels the running Turn, forgets the Session, and starts the next send without one", async () => {
    localStorage.setItem(STORAGE_KEY, sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay);
    (await relay.next("history")).respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    const running = chat.send("Keep going");
    (await relay.next("chat")).respond(liveStream().response);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("running"));

    chat.newSession();

    expect(await running).toBe(false);
    expect(chat.getSnapshot().status).toBe("idle");
    expect(chat.getSnapshot().messages).toEqual([]);
    expect(chat.getSnapshot().sessionId).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    chat.send("Fresh start");
    expect((await relay.next("chat")).body).not.toHaveProperty("sessionId");
  });

  it("cancels the running Turn and resolves its send false on dispose()", async () => {
    const relay = fakeRelay();
    const chat = startChat(relay);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    const sent = chat.send("Hello");
    await relay.next("chat");

    chat.dispose();

    expect(await sent).toBe(false);
  });

  it.each([
    ["storageKey is null", { storageKey: null }, STORAGE_KEY],
    ["the stored value is not a Session ID", {}, "not-a-session"],
  ])("starts without a stored Session when %s", async (_, options, key) => {
    localStorage.setItem(STORAGE_KEY, key === STORAGE_KEY ? sessionId : key);
    const relay = fakeRelay();
    const chat = startChat(relay, options);

    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(relay.calls).toEqual([]);
    expect(chat.getSnapshot().sessionId).toBeUndefined();
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
    const chat = startChat(relay);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    const sent = chat.send("Hello");
    const stream = liveStream({ location: sessionLocation });
    (await relay.next("chat")).respond(stream.response);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await sent).toBe(true);
    expect(chat.getSnapshot().sessionId).toBe(sessionId);

    chat.dispose();
    chat.start();

    const history = await relay.next("history");
    expect(history.body).toEqual({ op: "history", sessionId });
    history.respond(historyPage(stored));
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    chat.newSession();
    expect(chat.getSnapshot().sessionId).toBeUndefined();
  });

  it("keeps a Session in memory only when storageKey is null", async () => {
    const relay = fakeRelay();
    const chat = startChat(relay, { storageKey: null });
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    chat.send("Hello");
    (await relay.next("chat")).respond(
      liveStream({ location: sessionLocation }).response
    );

    await vi.waitFor(() =>
      expect(chat.getSnapshot().sessionId).toBe(sessionId)
    );
    expect(localStorage.length).toBe(0);
    chat.newSession();
    expect(chat.getSnapshot().sessionId).toBeUndefined();
  });
});
