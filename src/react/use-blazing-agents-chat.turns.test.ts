// @vitest-environment happy-dom
import {
  act,
  cleanup,
  type RenderHookResult,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvalReply,
  assistantMessage,
  fakeRelay,
  historyPage,
  liveStream,
  type RelayCall,
  relayError,
  reply,
  sessionId,
  sessionLocation,
  steerConsumed,
  transcript,
  userMessage,
} from "../test/fake-chat-relay.ts";
import { type BlazingAgentsChat, useBlazingAgentsChat } from "./index.ts";

type Hook = RenderHookResult<BlazingAgentsChat, unknown>["result"];
type Relay = ReturnType<typeof fakeRelay>;

// Node's own localStorage global shadows happy-dom's, so give each test a fresh one.
beforeEach(() => vi.stubGlobal("localStorage", new Storage()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mountIdle() {
  const relay = fakeRelay();
  const { result } = renderHook(() =>
    useBlazingAgentsChat({ fetch: relay.fetch })
  );
  await waitFor(() => expect(result.current.status).toBe("idle"));
  return { relay, result };
}

function send(result: Hook, text: string): Promise<boolean> {
  let sent!: Promise<boolean>;
  act(() => {
    sent = result.current.send(text);
  });
  return sent;
}

/** Answers the next chat request with a stream the test keeps open. */
async function answerChat(relay: Relay, first = false) {
  const call = await relay.next("chat");
  const stream = liveStream(first ? { location: sessionLocation } : {});
  call.respond(stream.response);
  return { call, stream };
}

/** Runs one whole Turn on a new Session: Hello, then Hi there. */
async function firstTurn(relay: Relay, result: Hook) {
  const sent = send(result, "Hello");
  const { stream } = await answerChat(relay, true);
  stream.push(...reply("reply-1", "Hi there"));
  stream.close();
  expect(await sent).toBe(true);
  await waitFor(() => expect(result.current.status).toBe("idle"));
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

describe("useBlazingAgentsChat turns", () => {
  it("starts a Session, streams the reply, and remembers the Session", async () => {
    const { relay, result } = await mountIdle();

    const sent = send(result, "Hello");
    const { call, stream } = await answerChat(relay, true);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();

    expect(await sent).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(call.body).toMatchObject({
      op: "chat",
      message: { role: "user", parts: [{ type: "text", text: "Hello" }] },
    });
    expect(call.body).not.toHaveProperty("sessionId");
    expect(result.current.sessionId).toBe(sessionId);
    expect(localStorage.getItem("blazing-agents-session")).toBe(sessionId);
  });

  it("starts one Turn for two sends in one tick and steers the second into it", async () => {
    const { relay, result } = await mountIdle();

    let second!: Promise<boolean>;
    act(() => {
      result.current.send("First");
      second = result.current.send("Second");
    });
    const chat = await relay.next("chat");
    expect(relay.unread()).toEqual([]);
    expect(result.current.status).toBe("running");
    expect(transcript(result.current.messages)).toEqual([
      "user: First",
      "user: Second",
    ]);
    chat.respond(liveStream({ location: sessionLocation }).response);

    const steer = await relay.next("steer");
    expect(steer.body).toMatchObject({
      op: "steer",
      sessionId,
      message: { role: "user", parts: [{ type: "text", text: "Second" }] },
    });
    expect(steer.body.requestId).toEqual(expect.any(String));
    act(() => result.current.stop());
    (await relay.next("history")).respond(historyPage([]));
    expect(await second).toBe(false);
  });

  it("steers a message sent while the reply streams, then places it where stored history puts it", async () => {
    const { relay, result } = await mountIdle();
    const first = send(result, "Hello");
    const { stream } = await answerChat(relay, true);

    const second = send(result, "Also this");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    stream.push(
      steerConsumed(String(steer.body.requestId), "Also this"),
      ...reply("reply-1", "Both noted")
    );
    stream.close();

    const history = await relay.next("history");
    expect(history.body).toEqual({ op: "history", sessionId });
    expect(result.current.status).toBe("running");
    expect(transcript(result.current.messages)).toEqual([
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
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "user: Also this",
      "assistant: Both noted",
    ]);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("places a steer whose receipt is already committed", async () => {
    const { relay, result } = await mountIdle();
    send(result, "Hello");
    const { stream } = await answerChat(relay, true);

    const second = send(result, "Also this");
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
    const { relay, result } = await mountIdle();
    send(result, "Hello");
    const { stream } = await answerChat(relay, true);
    const second = send(result, "Also this");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    stream.push(
      steerConsumed(String(steer.body.requestId), "Also this"),
      ...reply("reply-1", "Both noted")
    );
    stream.close();

    (await relay.next("history")).respond(relayError(500, "internal_error"));

    expect(await second).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Both noted",
      "user: Also this",
    ]);
    expect(result.current.error).toMatchObject({ code: "internal_error" });
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("resends an accepted steer the Turn never read as ordinary chat with a fresh message ID", async () => {
    const { relay, result } = await mountIdle();
    send(result, "Hello");
    const { stream } = await answerChat(relay, true);
    const second = send(result, "Also this");
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
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
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
      const { relay, result } = await mountIdle();
      send(result, "Hello");
      const { stream } = await answerChat(relay, true);
      const second = send(result, "Also this");
      answer(await relay.next("steer"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(relay.unread()).toEqual([]);
      expect(result.current.error).toBeUndefined();

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
    const { relay, result } = await mountIdle();
    const first = send(result, "Hello");
    const { stream } = await answerChat(relay, true);
    const second = send(result, "Also this");

    (await relay.next("steer")).respond(relayError(401, "unauthorized"));

    expect(await second).toBe(false);
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: "unauthorized" })
    );
    expect(transcript(result.current.messages)).toEqual(["user: Hello"]);
    stream.push(...reply("reply-1", "Hi there"));
    stream.close();
    expect(await first).toBe(true);
    act(() => result.current.clearError());
    expect(result.current.error).toBeUndefined();
  });

  it("rolls back to the stored transcript when a Turn fails, and resolves every pending send false", async () => {
    const { relay, result } = await mountIdle();
    await firstTurn(relay, result);

    const prompt = send(result, "Break");
    const { stream } = await answerChat(relay);
    const steered = send(result, "And this");
    (await relay.next("steer")).respond(accepted());
    stream.push({ type: "error", errorText: "The model failed." });
    (await relay.next("history")).respond(historyPage(firstTurnStored));

    expect(await prompt).toBe(false);
    expect(await steered).toBe(false);
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(result.current.error?.message).toBe("The model failed.");
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("rolls back without reading history when the relay refuses the chat", async () => {
    const { relay, result } = await mountIdle();
    await firstTurn(relay, result);

    const sent = send(result, "Again");
    (await relay.next("chat")).respond(relayError(401, "unauthorized"));

    expect(await sent).toBe(false);
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(result.current.error).toMatchObject({
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
      const { relay, result } = await mountIdle();
      await firstTurn(relay, result);
      const sent = send(result, "Again");
      const { stream } = await answerChat(relay);

      stream.push(...partialReply, ...ending);
      stream.close();

      const history = await relay.next("history");
      await waitFor(() =>
        expect(transcript(result.current.messages)).toEqual([
          "user: Hello",
          "assistant: Hi there",
          "user: Again",
        ])
      );
      expect(result.current.status).toBe("running");
      history.respond(historyPage(firstTurnStored));
      expect(await sent).toBe(false);
      await waitFor(() => expect(result.current.status).toBe("idle"));
      expect(transcript(result.current.messages)).toEqual([
        "user: Hello",
        "assistant: Hi there",
      ]);
      expect(result.current.pendingIds.size).toBe(0);
      expect(result.current.error?.message).toBe(error);
      expect(relay.unread()).toEqual([]);
    }
  );

  it("keeps what a Turn stored before its connection dropped, and rolls back the rest", async () => {
    const { relay, result } = await mountIdle();
    await firstTurn(relay, result);
    const prompt = send(result, "Again");
    const { call, stream } = await answerChat(relay);
    const read = send(result, "Also this");
    const readSteer = await relay.next("steer");
    readSteer.respond(accepted());
    const unread = send(result, "And this");
    await relay.next("steer");
    stream.push(
      steerConsumed(String(readSteer.body.requestId), "Also this"),
      ...partialReply
    );
    await waitFor(() =>
      expect(transcript(result.current.messages)).toContain("assistant: Part")
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
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Again",
      "user: Also this",
      "assistant: Partly done",
    ]);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("rolls back a Turn that ended without finish when stored history cannot be read", async () => {
    const { relay, result } = await mountIdle();
    await firstTurn(relay, result);
    const sent = send(result, "Again");
    const { stream } = await answerChat(relay);
    stream.push(...partialReply, { type: "abort" });
    stream.close();

    (await relay.next("history")).respond(relayError(500, "internal_error"));

    expect(await sent).toBe(false);
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(result.current.error).toMatchObject({ code: "internal_error" });
  });

  it.each([
    ["before the relay answers, without reading history", false],
    ["while the reply streams, once stored history lacks the Turn", true],
  ])("rolls back on Stop %s", async (_, streaming) => {
    const { relay, result } = await mountIdle();
    await firstTurn(relay, result);

    const sent = send(result, "Never mind");
    const steered = send(result, "Really");
    let steer: RelayCall | undefined;
    if (streaming) {
      const { stream } = await answerChat(relay);
      steer = await relay.next("steer");
      stream.push(...partialReply);
      await waitFor(() => expect(result.current.messages).toHaveLength(5));
    } else {
      await relay.next("chat");
    }
    act(() => result.current.stop());
    if (streaming) {
      (await relay.next("history")).respond(historyPage(firstTurnStored));
    }

    expect(await sent).toBe(false);
    expect(await steered).toBe(false);
    await waitFor(() => expect(result.current.status).toBe("idle"));
    steer?.fail();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
    ]);
    expect(result.current.error).toBeUndefined();
    expect(relay.unread()).toEqual([]);
    expect(historyReads(relay)).toBe(streaming ? 1 : 0);
  });

  it("regenerates the last reply", async () => {
    const { relay, result } = await mountIdle();
    expect(result.current.canRegenerate).toBe(false);
    act(() => result.current.regenerate());
    act(() => result.current.stop());
    expect(relay.calls).toHaveLength(0);
    await firstTurn(relay, result);
    expect(result.current.canRegenerate).toBe(true);

    act(() => result.current.regenerate());
    const { call, stream } = await answerChat(relay);
    expect(call.body).toMatchObject({
      op: "chat",
      sessionId,
      trigger: "regenerate-message",
      message: { parts: [{ type: "text", text: "Hello" }] },
    });
    stream.push(...reply("reply-2", "Hello again"));
    stream.close();

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hello again",
    ]);
  });

  it("re-reads history after a Stop during a regenerate, and shows what the Turn stored", async () => {
    const { relay, result } = await mountIdle();
    await firstTurn(relay, result);
    act(() => result.current.regenerate());
    const { stream } = await answerChat(relay);
    stream.push(...partialReply);
    await waitFor(() =>
      expect(transcript(result.current.messages)).toEqual([
        "user: Hello",
        "assistant: Part",
      ])
    );

    act(() => result.current.stop());

    (await relay.next("history")).respond(
      historyPage([
        userMessage("user-1", "Hello"),
        assistantMessage("reply-2", "Hello again"),
      ])
    );
    await waitFor(() =>
      expect(transcript(result.current.messages)).toEqual([
        "user: Hello",
        "assistant: Hello again",
      ])
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.canRegenerate).toBe(true);
  });

  it("waits for a pending approval before starting a Turn, then steers into the continuation", async () => {
    const { relay, result } = await mountIdle();
    send(result, "Look up my order");
    const turn = await answerChat(relay, true);
    turn.stream.push(...approvalReply("reply-1", false));
    turn.stream.close();
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.canRegenerate).toBe(false);

    const queued = send(result, "Quickly please");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
    expect(transcript(result.current.messages).at(-1)).toBe(
      "user: Quickly please"
    );
    act(() =>
      result.current.addToolApprovalResponse({
        id: "approval-1",
        approved: true,
      })
    );

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
    const { relay, result } = await mountIdle();
    send(result, "Look up my order");
    const turn = await answerChat(relay, true);
    const queued = send(result, "Quickly please");
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
    const { relay, result } = await mountIdle();
    send(result, "Look up my orders");
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
    await waitFor(() => expect(result.current.status).toBe("idle"));

    act(() =>
      result.current.addToolApprovalResponse({
        id: "approval-1",
        approved: true,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.unread()).toEqual([]);
    expect(result.current.status).toBe("idle");

    act(() =>
      result.current.addToolApprovalResponse({
        id: "approval-2",
        approved: false,
      })
    );
    await relay.next("chat");
    expect(result.current.status).toBe("running");
  });
  it("sends text with files as one user message", async () => {
    const { relay, result } = await mountIdle();
    const file = {
      type: "file" as const,
      mediaType: "image/png",
      url: "data:image/png;base64,AA==",
    };

    act(() => {
      result.current.send({ text: "What is this?", files: [file] });
    });

    expect((await relay.next("chat")).body).toMatchObject({
      message: {
        role: "user",
        parts: [file, { type: "text", text: "What is this?" }],
      },
    });
  });

  it("keeps each steer's fate apart when answers race the stream", async () => {
    const { relay, result } = await mountIdle();
    send(result, "Hello");
    const { stream } = await answerChat(relay, true);
    const lost = send(result, "Second");
    const read = send(result, "Third");
    const lostSteer = await relay.next("steer");
    const readSteer = await relay.next("steer");

    stream.push(steerConsumed(String(readSteer.body.requestId), "Third"));
    await waitFor(() =>
      expect(transcript(result.current.messages)).toHaveLength(3)
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
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
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
      const { relay, result } = await mountIdle();
      send(result, "Hello");
      const { stream } = await answerChat(relay, true);
      const late = send(result, "Late");
      const steer = await relay.next("steer");
      stream.push(...reply("reply-1", "Hi there"));
      stream.close();
      await waitFor(() =>
        expect(transcript(result.current.messages)).toEqual([
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
    const { relay, result } = await mountIdle();
    send(result, "Hello");
    const first = await answerChat(relay, true);
    const second = send(result, "Second");
    (await relay.next("steer")).respond(relayError(409, "steer_not_available"));
    const third = send(result, "Third");
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
    expect(transcript(result.current.messages)).toEqual([
      "user: Hello",
      "assistant: Hi there",
      "user: Second",
      "user: Third",
      "assistant: Both noted",
    ]);
  });

  it("finishes an approval continuation that starts while stored history is re-read", async () => {
    const { relay, result } = await mountIdle();
    send(result, "Look up my order");
    const turn = await answerChat(relay, true);
    const steered = send(result, "Quickly please");
    const steer = await relay.next("steer");
    steer.respond(accepted());
    turn.stream.push(
      steerConsumed(String(steer.body.requestId), "Quickly please"),
      ...approvalReply("reply-1", false)
    );
    turn.stream.close();
    const staleHistory = await relay.next("history");

    act(() =>
      result.current.addToolApprovalResponse({
        id: "approval-1",
        approved: true,
      })
    );
    const continuation = await answerChat(relay);
    await waitFor(() => expect(result.current.status).toBe("running"));
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
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(transcript(result.current.messages)).toEqual([
      "user: Look up my order",
      "user: Quickly please",
      "assistant: Order found",
    ]);
  });
});
