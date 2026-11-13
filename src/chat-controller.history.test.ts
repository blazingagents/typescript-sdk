import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantMessage,
  disposeChats,
  fakeRelay,
  liveStream,
  memoryStorage,
  pagedHistory,
  sessionId,
  startChat,
  transcript,
  userMessage,
} from "./test/fake-chat-relay.ts";

type Relay = ReturnType<typeof fakeRelay>;

/** `count` stored messages, alternating question and answer. */
const conversation = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => {
    const n = from + index;
    return n % 2 === 0
      ? userMessage(`user-${n}`, `Question ${n}`)
      : assistantMessage(`reply-${n}`, `Answer ${n}`);
  });
const historyReads = (relay: Relay) =>
  relay.calls.filter((call) => call.body.op === "history").length;

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
  disposeChats();
  vi.unstubAllGlobals();
});

/** Restores `stored` through every history page. */
async function restored(stored: unknown[]) {
  localStorage.setItem("blazing-agents-session", sessionId);
  const relay = fakeRelay();
  const chat = startChat(relay);
  while (chat.getSnapshot().status === "restoring") {
    const call = await relay.next("history");
    call.respond(pagedHistory(stored, call));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(chat.getSnapshot().messages).toHaveLength(stored.length);
  return { chat, relay, restoreReads: historyReads(relay) };
}

/** Answers the next chat request with a reply that ends without `finish`. */
async function answerWithoutFinish(relay: Relay) {
  const request = await relay.next("chat");
  const stream = liveStream();
  request.respond(stream.response);
  stream.push(
    { type: "start", messageId: "reply-new" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: "Part" },
    { type: "abort" }
  );
  stream.close();
  return request;
}

/** Restores `stored`, then sends `Again` into a Turn that ends without `finish`. */
async function turnEndingWithoutFinish(stored: unknown[]) {
  const { chat, relay, restoreReads } = await restored(stored);
  const sent = chat.send("Again");
  const request = await answerWithoutFinish(relay);
  const prompt = userMessage(
    (request.body.message as { id: string }).id,
    "Again"
  );
  return { chat, prompt, relay, restoreReads, sent };
}

describe("BlazingAgentsChat history after a Turn ends without finish", () => {
  it("reads only the newest page of a long Session and keeps the rest of the stored transcript", async () => {
    const stored = conversation(450);
    const { chat, prompt, relay, restoreReads, sent } =
      await turnEndingWithoutFinish(stored);
    expect(restoreReads).toBe(3);
    const afterTurn = [
      ...stored,
      prompt,
      assistantMessage("reply-new", "Partly done"),
    ];

    const history = await relay.next("history");
    expect(history.body).toEqual({ op: "history", sessionId });
    history.respond(pagedHistory(afterTurn, history));

    expect(await sent).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(historyReads(relay)).toBe(restoreReads + 1);
    expect(relay.unread()).toEqual([]);
    expect(transcript(chat.getSnapshot().messages)).toEqual(
      transcript(afterTurn)
    );
  });

  it("reads older pages until one reaches the known transcript when more than a page changed", async () => {
    const stored = conversation(10);
    const { chat, prompt, relay, restoreReads, sent } =
      await turnEndingWithoutFinish(stored);
    expect(restoreReads).toBe(1);
    const afterTurn = [...stored, prompt, ...conversation(250, 11)];

    const newest = await relay.next("history");
    newest.respond(pagedHistory(afterTurn, newest));
    const older = await relay.next("history");
    expect(older.body).toEqual({ op: "history", sessionId, cursor: "61" });
    older.respond(pagedHistory(afterTurn, older));

    expect(await sent).toBe(true);
    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(relay.unread()).toEqual([]);
    expect(transcript(chat.getSnapshot().messages)).toEqual(
      transcript(afterTurn)
    );
  });

  it("leaves out the replaced reply when a regenerate on a long Session ends without finish", async () => {
    const stored = conversation(450);
    const { chat, relay, restoreReads } = await restored(stored);
    chat.regenerate();
    const request = await answerWithoutFinish(relay);
    expect(request.body).toMatchObject({ trigger: "regenerate-message" });
    const afterTurn = [
      ...stored.slice(0, -1),
      assistantMessage("reply-new", "Answer again"),
    ];

    const history = await relay.next("history");
    history.respond(pagedHistory(afterTurn, history));

    await vi.waitFor(() => expect(chat.getSnapshot().status).toBe("idle"));
    expect(historyReads(relay)).toBe(restoreReads + 1);
    expect(transcript(chat.getSnapshot().messages)).toEqual(
      transcript(afterTurn)
    );
  });
});
