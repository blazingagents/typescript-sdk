import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlazingAgentsChat, BlazingAgentsChatSnapshot } from "./index.ts";
import {
  approvalReply,
  assistantMessage,
  disposeChats,
  fakeRelay,
  historyPage,
  liveStream,
  memoryStorage,
  type RelayCall,
  relayError,
  reply,
  sessionId,
  sessionLocation,
  startChat,
  steerConsumed,
  transcript,
  userMessage,
} from "./test/fake-chat-relay.ts";

type Relay = ReturnType<typeof fakeRelay>;

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
  disposeChats();
  vi.unstubAllGlobals();
});

async function startIdle() {
  const relay = fakeRelay();
  const chat = startChat(relay);
  await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
  return { chat, relay };
}

/** Answers the next chat request with a stream the test keeps open. */
async function answerChat(relay: Relay, first = false) {
  const call = await relay.next("chat");
  const stream = liveStream(first ? { location: sessionLocation } : {});
  call.respond(stream.response);
  return { call, stream };
}

/** Runs one whole Turn on a new Session: Hello, then Hi there. */
async function firstTurn(relay: Relay, chat: BlazingAgentsChat) {
  const sent = chat.send("Hello");
  const { stream } = await answerChat(relay, true);
  stream.push(...reply("reply-1", "Hi there"));
  stream.close();
  expect(await sent).toBe(true);
  await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
}

const accepted = () => Response.json({ state: "accepted" }, { status: 202 });
/** What the API stores after `firstTurn`. */
const firstTurnStored = [
  userMessage("user-1", "Hello"),
  assistantMessage("reply-1", "Hi there"),
];
/** The start of a reply that has not finished. */
const partialReply = [
  { type: "start", messageId: "reply-2" },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "Part" },
];
const historyReads = (relay: Relay) =>
  relay.calls.filter((call) => call.body.op === "history").length;

describe("BlazingAgentsChat turns", () => {
  it("starts a Session, streams the reply, and remembers the Session", async () => {
    const { chat, relay } = await startIdle();

    const sent = chat.send("Hello");
    const { call, stream } = await answerChat(relay, true);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();

    expect(await sent).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(call.body).toMatchObject({
      op: "chat",
      message: { role: "user", parts: [{ type: "text", text: "Hello" }] },
    });
    expect(call.body).not.toHaveProperty("sessionId");
    expect(chat.getSnapshot().sessionId).toBe(sessionId);
    expect(localStorage.getItem("blazing-agents-session")).toBe(sessionId);
  });

  it("completes a send where structuredClone throws unless called on the global, as in browsers", async () => {
    const clone = structuredClone;
    vi.stubGlobal("structuredClone", function (this: unknown, value: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return clone(value);
    });
    const { chat, relay } = await startIdle();

    const sent = chat.send("Hello");
    const { stream } = await answerChat(relay, true);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();

    expect(await sent).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
  });

  it("starts one Turn for two sends in one tick and steers the second into it", async () => {
    const { chat, relay } = await startIdle();

    chat.send("First");
    const second = chat.send("Second");
    const request = await relay.next("chat");
    expect(relay.unread()).toEqual([]);
    expect(chat.getSnapshot().status).toBe("running");
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: First",
      "user: Second",
    ]);
    request.respond(liveStream({ location: sessionLocation }).response);

    const steer = await relay.next("steer");
    expect(steer.body).toMatchObject({
      op: "steer",
      sessionId,
      message: { role: "user", parts: [{ type: "text", text: "Second" }] },
    });
    expect(steer.body.requestId).toEqual(expect.any(String));
    chat.stop();
    (await relay.next("history")).respond(historyPage([]));
    expect(await second).toBe(false);
  });

  it("steers a message sent while the reply streams, then places it where stored history puts it", async () => {
    const { chat, relay } = await startIdle();
    const first = chat.send("Hello");
    const { stream } = await answerChat(relay, true);

    const second = chat.send("Also this");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    stream.push(
      steerConsumed(String(steer.body.requestId), "Also this"),
      ...reply("reply-1", "Both noted")
    );
    stream.close();

    const history = await relay.next("history");
    expect(history.body).toEqual({ op: "history", sessionId });
    expect(chat.getSnapshot().status).toBe("running");
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Both noted",
      "user: Also this",
    ]);
    history.respond(
      historyPage([
        userMessage("user-1", "Hello"),
        userMessage("user-2", "Also this"),
        assistantMessage("reply-1", "Both noted"),
      ])
    );

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "user: Also this",
      "assistant: Both noted",
    ]);
    expect(chat.getSnapshot().pendingIds.size).toBe(0);
  });

  it("places a steer whose receipt is already committed", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Hello");
    const { stream } = await answerChat(relay, true);

    const second = chat.send("Also this");
    (await relay.next("steer")).respond(
      Response.json({ state: "committed" }, { status: 202 })
    );
    stream.push(...reply("reply-1", "Both noted"));
    stream.close();
    (await relay.next("history")).respond(
      historyPage([
        userMessage("user-1", "Hello"),
        userMessage("user-2", "Also this"),
        assistantMessage("reply-1", "Both noted"),
      ])
    );

    expect(await second).toBe(true);
    expect(relay.unread()).toEqual([]);
  });

  it("appends a read steer when stored history cannot be read afterwards", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Hello");
    const { stream } = await answerChat(relay, true);
    const second = chat.send("Also this");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    stream.push(
      steerConsumed(String(steer.body.requestId), "Also this"),
      ...reply("reply-1", "Both noted")
    );
    stream.close();

    (await relay.next("history")).respond(relayError(500, "internal_error"));

    expect(await second).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Both noted",
      "user: Also this",
    ]);
    expect(chat.getSnapshot().error).toMatchObject({ code: "internal_error" });
    expect(chat.getSnapshot().pendingIds.size).toBe(0);
  });

  it("resends an accepted steer the Turn never read as ordinary chat with a fresh message ID", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Hello");
    const { stream } = await answerChat(relay, true);
    const second = chat.send("Also this");
    const steer = await relay.next("steer");
    steer.respond(accepted());

    stream.push(...reply("reply-1", "Hi there"));
    stream.close();

    const resent = await answerChat(relay);
    expect(resent.call.body).toMatchObject({
      op: "chat",
      sessionId,
      message: { role: "user", parts: [{ type: "text", text: "Also this" }] },
    });
    expect((resent.call.body.message as { id: string }).id).not.toBe(
      (steer.body.message as { id: string }).id
    );
    resent.stream.push(...reply("reply-2", "Got it"));
    resent.stream.close();

    expect(await second).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Also this",
      "assistant: Got it",
    ]);
  });

  it.each([
    [
      "409 steer_not_available",
      (steer: RelayCall) =>
        steer.respond(relayError(409, "steer_not_available")),
    ],
    [
      "a not_placed receipt",
      (steer: RelayCall) =>
        steer.respond(Response.json({ state: "not_placed" }, { status: 202 })),
    ],
    ["a lost answer", (steer: RelayCall) => steer.fail()],
  ])(
    "sends a steer answered with %s as the next Turn, without steering it again",
    async (_, answer) => {
      const { chat, relay } = await startIdle();
      chat.send("Hello");
      const { stream } = await answerChat(relay, true);
      const second = chat.send("Also this");
      answer(await relay.next("steer"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(relay.unread()).toEqual([]);
      expect(chat.getSnapshot().error).toBeUndefined();

      stream.push(...reply("reply-1", "Hi there"));
      stream.close();
      const resent = await answerChat(relay);
      expect(resent.call.body).toMatchObject({
        message: { parts: [{ type: "text", text: "Also this" }] },
      });
      resent.stream.push(...reply("reply-2", "Got it"));
      resent.stream.close();

      expect(await second).toBe(true);
    }
  );

  it("rolls back a steer the relay rejects and keeps the Turn streaming", async () => {
    const { chat, relay } = await startIdle();
    const first = chat.send("Hello");
    const { stream } = await answerChat(relay, true);
    const second = chat.send("Also this");

    (await relay.next("steer")).respond(relayError(401, "unauthorized"));

    expect(await second).toBe(false);
    await vi.waitFor(() =>
      expect(chat.getSnapshot().error).toMatchObject({ code: "unauthorized" })
    );
    expect(transcript(chat.getSnapshot().messages)).toEqual(["user: Hello"]);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await first).toBe(true);
    chat.clearError();
    expect(chat.getSnapshot().error).toBeUndefined();
  });

  it("rolls back to the stored transcript when a Turn fails, and resolves every pending send false", async () => {
    const { chat, relay } = await startIdle();
    await firstTurn(relay, chat);

    const prompt = chat.send("Break");
    const { stream } = await answerChat(relay);
    const steered = chat.send("And this");
    (await relay.next("steer")).respond(accepted());
    stream.push({ type: "error", errorText: "The model failed." });
    (await relay.next("history")).respond(historyPage(firstTurnStored));

    expect(await prompt).toBe(false);
    expect(await steered).toBe(false);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(chat.getSnapshot().error?.message).toBe("The model failed.");
    expect(chat.getSnapshot().pendingIds.size).toBe(0);
  });

  it("rolls back without reading history when the relay refuses the chat", async () => {
    const { chat, relay } = await startIdle();
    await firstTurn(relay, chat);

    const sent = chat.send("Again");
    (await relay.next("chat")).respond(relayError(401, "unauthorized"));

    expect(await sent).toBe(false);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(chat.getSnapshot().error).toMatchObject({
      code: "unauthorized",
      status: 401,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(historyReads(relay)).toBe(0);
  });

  it.each([
    ["in an abort chunk", [{ type: "abort" }], undefined],
    [
      "in a finish chunk with an error",
      [{ type: "finish", finishReason: "error" }],
      "The reply failed.",
    ],
    ["without a terminal chunk", [], undefined],
  ])(
    "rolls back a reply whose stream ends %s once stored history lacks its prompt",
    async (_, ending, error) => {
      const { chat, relay } = await startIdle();
      await firstTurn(relay, chat);
      const sent = chat.send("Again");
      const { stream } = await answerChat(relay);

      stream.push(...partialReply, ...ending);
      stream.close();

      const history = await relay.next("history");
      await vi.waitFor(() =>
        expect(transcript(chat.getSnapshot().messages)).toEqual([
          "user: Hello",
          "assistant: Hi there",
          "user: Again",
        ])
      );
      expect(chat.getSnapshot().status).toBe("running");
      history.respond(historyPage(firstTurnStored));
      expect(await sent).toBe(false);
      await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
      expect(transcript(chat.getSnapshot().messages)).toEqual([
        "user: Hello",
        "assistant: Hi there",
      ]);
      expect(chat.getSnapshot().pendingIds.size).toBe(0);
      expect(chat.getSnapshot().error?.message).toBe(error);
      expect(relay.unread()).toEqual([]);
    }
  );

  it("keeps what a Turn stored before its connection dropped, and rolls back the rest", async () => {
    const { chat, relay } = await startIdle();
    await firstTurn(relay, chat);
    const prompt = chat.send("Again");
    const { call, stream } = await answerChat(relay);
    const read = chat.send("Also this");
    const readSteer = await relay.next("steer");
    readSteer.respond(accepted());
    const unread = chat.send("And this");
    await relay.next("steer");
    stream.push(
      steerConsumed(String(readSteer.body.requestId), "Also this"),
      ...partialReply
    );
    await vi.waitFor(() =>
      expect(transcript(chat.getSnapshot().messages)).toContain(
        "assistant: Part"
      )
    );

    stream.fail();

    const idOf = (body: Record<string, unknown>) =>
      (body.message as { id: string }).id;
    (await relay.next("history")).respond(
      historyPage([
        ...firstTurnStored,
        userMessage(idOf(call.body), "Again"),
        userMessage(idOf(readSteer.body), "Also this"),
        assistantMessage("reply-2", "Partly done"),
      ])
    );
    expect(await prompt).toBe(true);
    expect(await read).toBe(true);
    expect(await unread).toBe(false);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Again",
      "user: Also this",
      "assistant: Partly done",
    ]);
    expect(chat.getSnapshot().pendingIds.size).toBe(0);
  });

  it("rolls back a Turn that ended without finish when stored history cannot be read", async () => {
    const { chat, relay } = await startIdle();
    await firstTurn(relay, chat);
    const sent = chat.send("Again");
    const { stream } = await answerChat(relay);
    stream.push(...partialReply, { type: "abort" });
    stream.close();

    (await relay.next("history")).respond(relayError(500, "internal_error"));

    expect(await sent).toBe(false);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(chat.getSnapshot().error).toMatchObject({ code: "internal_error" });
  });

  it.each([
    ["before the relay answers, without reading history", false],
    ["while the reply streams, once stored history lacks the Turn", true],
  ])("rolls back on Stop %s", async (_, streaming) => {
    const { chat, relay } = await startIdle();
    await firstTurn(relay, chat);

    const sent = chat.send("Never mind");
    const steered = chat.send("Really");
    let steer: RelayCall | undefined;
    if (streaming) {
      const { stream } = await answerChat(relay);
      steer = await relay.next("steer");
      stream.push(...partialReply);
      await vi.waitFor(() =>
        expect(chat.getSnapshot().messages).toHaveLength(5)
      );
    } else {
      await relay.next("chat");
    }
    chat.stop();
    if (streaming) {
      (await relay.next("history")).respond(historyPage(firstTurnStored));
    }

    expect(await sent).toBe(false);
    expect(await steered).toBe(false);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    steer?.fail();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(chat.getSnapshot().error).toBeUndefined();
    expect(relay.unread()).toEqual([]);
    expect(historyReads(relay)).toBe(streaming ? 1 : 0);
  });

  it("regenerates the last reply", async () => {
    const { chat, relay } = await startIdle();
    expect(chat.getSnapshot().canRegenerate).toBe(false);
    chat.regenerate();
    chat.stop();
    expect(relay.calls).toHaveLength(0);
    await firstTurn(relay, chat);
    expect(chat.getSnapshot().canRegenerate).toBe(true);

    chat.regenerate();
    const { call, stream } = await answerChat(relay);
    expect(call.body).toMatchObject({
      op: "chat",
      sessionId,
      trigger: "regenerate-message",
      message: { parts: [{ type: "text", text: "Hello" }] },
    });
    stream.push(...reply("reply-2", "Hello again"));
    stream.close();

    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hello again",
    ]);
  });

  it("re-reads history after a Stop during a regenerate, and shows what the Turn stored", async () => {
    const { chat, relay } = await startIdle();
    await firstTurn(relay, chat);
    chat.regenerate();
    const { stream } = await answerChat(relay);
    stream.push(...partialReply);
    await vi.waitFor(() =>
      expect(transcript(chat.getSnapshot().messages)).toEqual([
        "user: Hello",
        "assistant: Part",
      ])
    );

    chat.stop();

    (await relay.next("history")).respond(
      historyPage([
        userMessage("user-1", "Hello"),
        assistantMessage("reply-2", "Hello again"),
      ])
    );
    await vi.waitFor(() =>
      expect(transcript(chat.getSnapshot().messages)).toEqual([
        "user: Hello",
        "assistant: Hello again",
      ])
    );
    expect(chat.getSnapshot().status).toBe("idle");
    expect(chat.getSnapshot().canRegenerate).toBe(true);
  });

  it("waits for a pending approval before starting a Turn, then steers into the continuation", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Look up my order");
    const turn = await answerChat(relay, true);
    turn.stream.push(...approvalReply("reply-1", false));
    turn.stream.close();
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(chat.getSnapshot().canRegenerate).toBe(false);

    const queued = chat.send("Quickly please");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
    expect(transcript(chat.getSnapshot().messages).at(-1)).toBe(
      "user: Quickly please"
    );
    chat.addToolApprovalResponse({
      id: "approval-1",
      approved: true,
    });

    const continuation = await answerChat(relay);
    expect(continuation.call.body).toMatchObject({
      op: "chat",
      sessionId,
      message: {
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({ state: "approval-responded" }),
        ]),
      },
    });
    const steer = await relay.next("steer");
    expect(steer.body).toMatchObject({
      message: { parts: [{ type: "text", text: "Quickly please" }] },
    });
    steer.respond(accepted());
    continuation.stream.push(
      steerConsumed(String(steer.body.requestId), "Quickly please"),
      ...reply("reply-2", "Order found")
    );
    continuation.stream.close();
    (await relay.next("history")).respond(
      historyPage([userMessage("user-1", "Look up my order")])
    );

    expect(await queued).toBe(true);
  });

  it("lets an automatic approval continuation run before a queued message", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Look up my order");
    const turn = await answerChat(relay, true);
    const queued = chat.send("Quickly please");
    (await relay.next("steer")).respond(relayError(409, "steer_not_available"));

    turn.stream.push(...approvalReply("reply-1", true));
    turn.stream.close();

    const continuation = await answerChat(relay);
    expect(continuation.call.body).toMatchObject({
      message: { role: "assistant" },
    });
    const steer = await relay.next("steer");
    expect(steer.body).toMatchObject({
      message: { parts: [{ type: "text", text: "Quickly please" }] },
    });
    steer.respond(accepted());
    continuation.stream.push(...reply("reply-2", "Order found"));
    continuation.stream.close();
    const resent = await answerChat(relay);
    expect(resent.call.body).toMatchObject({
      message: {
        role: "user",
        parts: [{ type: "text", text: "Quickly please" }],
      },
    });
    resent.stream.push(...reply("reply-3", "On it"));
    resent.stream.close();

    expect(await queued).toBe(true);
  });

  it("sends nothing until every approval of a round is answered", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Look up my orders");
    const turn = await answerChat(relay, true);
    turn.stream.push(
      { type: "start", messageId: "reply-1" },
      { type: "start-step" },
      ...["1", "2"].flatMap((n) => [
        {
          type: "tool-input-available",
          toolCallId: `call-${n}`,
          toolName: "getOrder",
          input: { orderId: n },
        },
        {
          type: "tool-approval-request",
          approvalId: `approval-${n}`,
          toolCallId: `call-${n}`,
        },
      ]),
      { type: "finish", finishReason: "tool-calls" }
    );
    turn.stream.close();
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));

    chat.addToolApprovalResponse({
      id: "approval-1",
      approved: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
    expect(chat.getSnapshot().status).toBe("idle");

    chat.addToolApprovalResponse({
      id: "approval-2",
      approved: false,
    });
    await relay.next("chat");
    expect(chat.getSnapshot().status).toBe("running");
  });
  it("sends text with files as one user message", async () => {
    const { chat, relay } = await startIdle();
    const file = {
      type: "file" as const,
      mediaType: "image/png",
      url: "data:image/png;base64,AA==",
    };

    chat.send({ text: "What is this?", files: [file] });

    expect((await relay.next("chat")).body).toMatchObject({
      message: {
        role: "user",
        parts: [file, { type: "text", text: "What is this?" }],
      },
    });
  });

  it("keeps each steer's fate apart when answers race the stream", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Hello");
    const { stream } = await answerChat(relay, true);
    const lost = chat.send("Second");
    const read = chat.send("Third");
    const lostSteer = await relay.next("steer");
    const readSteer = await relay.next("steer");

    stream.push(steerConsumed(String(readSteer.body.requestId), "Third"));
    await vi.waitFor(() =>
      expect(transcript(chat.getSnapshot().messages)).toHaveLength(3)
    );
    readSteer.respond(accepted());
    lostSteer.fail();
    stream.push(...reply("reply-1", "Noted"));
    stream.close();

    (await relay.next("history")).respond(
      historyPage([
        userMessage("user-1", "Hello"),
        userMessage("user-3", "Third"),
        assistantMessage("reply-1", "Noted"),
      ])
    );
    expect(await read).toBe(true);
    const resent = await answerChat(relay);
    expect(resent.call.body).toMatchObject({
      message: { parts: [{ type: "text", text: "Second" }] },
    });
    resent.stream.push(...reply("reply-2", "And second"));
    resent.stream.close();
    expect(await lost).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "user: Third",
      "assistant: Noted",
      "user: Second",
      "assistant: And second",
    ]);
  });

  it.each([
    ["accepted", (steer: RelayCall) => steer.respond(accepted())],
    ["lost to a network_error", (steer: RelayCall) => steer.fail()],
  ])(
    "resends a steer whose answer is %s after its Turn ended, as ordinary chat with a fresh message ID",
    async (_, answer) => {
      const { chat, relay } = await startIdle();
      chat.send("Hello");
      const { stream } = await answerChat(relay, true);
      const late = chat.send("Late");
      const steer = await relay.next("steer");
      stream.push(...reply("reply-1", "Hi there"));
      stream.close();
      await vi.waitFor(() =>
        expect(transcript(chat.getSnapshot().messages)).toEqual([
          "user: Hello",
          "assistant: Hi there",
          "user: Late",
        ])
      );
      expect(relay.unread()).toEqual([]);

      answer(steer);

      const resent = await answerChat(relay);
      expect(resent.call.body).toMatchObject({
        op: "chat",
        message: { parts: [{ type: "text", text: "Late" }] },
      });
      expect((resent.call.body.message as { id: string }).id).not.toBe(
        (steer.body.message as { id: string }).id
      );
      resent.stream.push(...reply("reply-2", "Got it"));
      resent.stream.close();
      expect(await late).toBe(true);
    }
  );

  it("leaves a steer accepted while the next Turn starts for that Turn's end to place", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Hello");
    const first = await answerChat(relay, true);
    const second = chat.send("Second");
    (await relay.next("steer")).respond(relayError(409, "steer_not_available"));
    const third = chat.send("Third");
    const steer = await relay.next("steer");
    first.stream.push(...reply("reply-1", "Hi there"));
    first.stream.close();
    const next = await relay.next("chat");
    expect(next.body).toMatchObject({
      message: { parts: [{ type: "text", text: "Second" }] },
    });

    steer.respond(accepted());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stream = liveStream();
    next.respond(stream.response);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);

    stream.push(
      steerConsumed(String(steer.body.requestId), "Third"),
      ...reply("reply-2", "Both noted")
    );
    stream.close();
    (await relay.next("history")).respond(
      historyPage([
        ...firstTurnStored,
        userMessage("user-2", "Second"),
        userMessage("user-3", "Third"),
        assistantMessage("reply-2", "Both noted"),
      ])
    );
    expect(await second).toBe(true);
    expect(await third).toBe(true);
    expect(relay.unread()).toEqual([]);
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Second",
      "user: Third",
      "assistant: Both noted",
    ]);
  });

  it("finishes an approval continuation that starts while stored history is re-read", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Look up my order");
    const turn = await answerChat(relay, true);
    const steered = chat.send("Quickly please");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    turn.stream.push(
      steerConsumed(String(steer.body.requestId), "Quickly please"),
      ...approvalReply("reply-1", false)
    );
    turn.stream.close();
    const staleHistory = await relay.next("history");

    chat.addToolApprovalResponse({
      id: "approval-1",
      approved: true,
    });
    const continuation = await answerChat(relay);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("running"));
    staleHistory.respond(historyPage([]));
    continuation.stream.push(...reply("reply-2", "Order found"));
    continuation.stream.close();

    (await relay.next("history")).respond(
      historyPage([
        userMessage("user-1", "Look up my order"),
        userMessage("user-2", "Quickly please"),
        assistantMessage("reply-2", "Order found"),
      ])
    );
    expect(await steered).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Look up my order",
      "user: Quickly please",
      "assistant: Order found",
    ]);
  });

  it("shows stored history and sends the queued message when the approval was already decided elsewhere", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Look up my order");
    const turn = await answerChat(relay, true);
    turn.stream.push(...approvalReply("reply-1", false));
    turn.stream.close();
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    const queued = chat.send("Quickly please");

    chat.addToolApprovalResponse({ id: "approval-1", approved: true });
    (await relay.next("chat")).respond(
      relayError(409, "tool_approval_continuation_settled")
    );

    const history = await relay.next("history");
    history.respond(
      historyPage([
        userMessage("user-1", "Look up my order"),
        {
          id: "reply-1",
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "tool-getOrder",
              toolCallId: "call-1",
              state: "output-available",
              input: { orderId: "o1" },
              output: { status: "shipped" },
              approval: { id: "approval-1", approved: true },
            },
            { type: "text", text: "It shipped" },
          ],
        },
      ])
    );
    await vi.waitFor(() =>
      expect(transcript(chat.getSnapshot().messages)).toEqual([
        "user: Look up my order",
        "assistant: It shipped",
        "user: Quickly please",
      ])
    );
    expect(chat.getSnapshot().error).toMatchObject({
      code: "tool_approval_continuation_settled",
    });
    const next = await answerChat(relay);
    expect(next.call.body).toMatchObject({
      message: {
        role: "user",
        parts: [{ type: "text", text: "Quickly please" }],
      },
    });
    next.stream.push(...reply("reply-2", "On it"));
    next.stream.close();
    expect(await queued).toBe(true);
  });

  it("keeps a steer the finished Turn read when its automatic approval continuation fails", async () => {
    const { chat, relay } = await startIdle();
    const first = chat.send("Look up my order");
    const turn = await answerChat(relay, true);
    const steered = chat.send("Quickly please");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    turn.stream.push(
      steerConsumed(String(steer.body.requestId), "Quickly please"),
      ...approvalReply("reply-1", true)
    );
    turn.stream.close();

    (await relay.next("chat")).respond(relayError(502, "network_error"));

    const history = await relay.next("history");
    await vi.waitFor(() =>
      expect(transcript(chat.getSnapshot().messages)).toContain(
        "user: Quickly please"
      )
    );
    history.respond(
      historyPage([
        userMessage("user-1", "Look up my order"),
        userMessage("user-2", "Quickly please"),
        assistantMessage("reply-1", "Checking"),
      ])
    );
    expect(await first).toBe(true);
    expect(await steered).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Look up my order",
      "user: Quickly please",
      "assistant: Checking",
    ]);
    expect(chat.getSnapshot().error).toMatchObject({ code: "network_error" });
  });

  it("resends a steer accepted while an automatic approval continuation starts, once that continuation fails", async () => {
    const { chat, relay } = await startIdle();
    chat.send("Look up my order");
    const turn = await answerChat(relay, true);
    const steered = chat.send("Quickly please");
    const steer = await relay.next("steer");
    turn.stream.push(...approvalReply("reply-1", true));
    turn.stream.close();
    const continuation = await relay.next("chat");

    steer.respond(accepted());
    await new Promise((resolve) => setTimeout(resolve, 0));
    continuation.respond(relayError(502, "network_error"));
    (await relay.next("history")).respond(
      historyPage([
        userMessage("user-1", "Look up my order"),
        assistantMessage("reply-1", "Checking"),
      ])
    );

    const resent = await answerChat(relay);
    expect(resent.call.body).toMatchObject({
      message: {
        role: "user",
        parts: [{ type: "text", text: "Quickly please" }],
      },
    });
    expect((resent.call.body.message as { id: string }).id).not.toBe(
      (steer.body.message as { id: string }).id
    );
    resent.stream.push(...reply("reply-2", "On it"));
    resent.stream.close();
    expect(await steered).toBe(true);
  });

  it("publishes each pending message in the snapshot that names it, across a send, a steer, a failed Turn, and an unclean end", async () => {
    const { chat, relay } = await startIdle();
    const published: BlazingAgentsChatSnapshot[] = [];
    chat.subscribe(() => published.push(chat.getSnapshot()));

    const first = chat.send("Hello");
    const turn = await answerChat(relay, true);
    chat.send("Also this");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    turn.stream.push(
      steerConsumed(String(steer.body.requestId), "Also this"),
      ...reply("reply-1", "Both noted")
    );
    turn.stream.close();
    const stored = [
      userMessage("user-1", "Hello"),
      userMessage("user-2", "Also this"),
      assistantMessage("reply-1", "Both noted"),
    ];
    (await relay.next("history")).respond(historyPage(stored));
    expect(await first).toBe(true);

    const failed = chat.send("Break");
    const broken = await answerChat(relay);
    broken.stream.push({ type: "error", errorText: "The model failed." });
    (await relay.next("history")).respond(historyPage(stored));
    expect(await failed).toBe(false);

    const again = chat.send("Again");
    const cut = await answerChat(relay);
    cut.stream.push(...partialReply, { type: "abort" });
    cut.stream.close();
    const prompt = cut.call.body.message as { id: string };
    (await relay.next("history")).respond(
      historyPage([
        ...stored,
        userMessage(prompt.id, "Again"),
        assistantMessage("reply-2", "Partly done"),
      ])
    );
    expect(await again).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));

    const hidden = published.flatMap((snapshot) =>
      [...snapshot.pendingIds].filter(
        (id) => !snapshot.messages.some((message) => message.id === id)
      )
    );
    expect(hidden).toEqual([]);
    const shown = published.map((snapshot) => transcript(snapshot.messages));
    const sinceAgain = shown.slice(
      shown.findIndex((messages) => messages.includes("user: Again"))
    );
    expect(
      sinceAgain.filter((messages) => !messages.includes("user: Again"))
    ).toEqual([]);
    expect(shown.at(-1)).toEqual([
      "user: Hello",
      "user: Also this",
      "assistant: Both noted",
      "user: Again",
      "assistant: Partly done",
    ]);
  });

  it("keeps a prompt sent from a listener visible while its Turn runs", async () => {
    localStorage.setItem("blazing-agents-session", sessionId);
    const relay = fakeRelay();
    const chat = startChat(relay);
    let queued: Promise<boolean> | undefined;
    chat.subscribe(() => {
      if (!queued && chat.getSnapshot().status === "idle") {
        queued = chat.send("Queued");
      }
    });

    (await relay.next("history")).respond(historyPage(firstTurnStored));

    const { stream } = await answerChat(relay);
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Queued",
    ]);
    stream.push(...reply("reply-2", "Got it"));
    stream.close();
    expect(await queued).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(transcript(chat.getSnapshot().messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Queued",
      "assistant: Got it",
    ]);
  });
});
