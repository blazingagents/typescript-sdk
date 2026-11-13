/**
 * The browser chat's policy as one pure function, `step(state, event)`.
 * `BlazingAgentsChat` owns the only mutable copy of `ChatState`, feeds it
 * events from its AI SDK chat and the transport, and runs the effects it
 * returns. The AI SDK chat owns the rendered transcript and the transport owns
 * the Session ID; this module owns what the server is known to store, the
 * phase, and the user messages not stored yet.
 */
import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import type { SteerOutcome } from "./chat-transport.ts";

export type UserMessage<M extends UIMessage> = M & { role: "user" };

/** One `send()` call. `key` names its promise and survives the fresh message ID a resend gets. */
export interface Sent<M extends UIMessage> {
  key: string;
  message: UserMessage<M>;
}

/**
 * A sent user message the chat answers for until it is stored or rolled
 * back. Stages only move forward, except that a message the Turn did not take
 * goes back to `waiting` with a fresh message ID.
 */
export type Outgoing<M extends UIMessage> = Sent<M> &
  (
    | { stage: "waiting" }
    /** Its Turn ended without `finish`; stored history decides whether it landed. */
    | { stage: "unconfirmed" }
    | {
        /**
         * `steering`: the steer request is out. `accepted`: the relay took it,
         * or its answer was lost, and the Turn may still read it. `refused`:
         * this Turn will not take it, so it waits for the Turn to end.
         * `consumed`: the Turn read it; it is stored when the Turn completes.
         */
        stage: "steering" | "accepted" | "refused" | "consumed";
        requestId: string;
      }
  );

export type Phase<M extends UIMessage> =
  /**
   * Reading the stored transcript. `load` is what happens next: `running`
   * waits for the answer, `stale` reads again if the answer fails because
   * the credentials changed meanwhile, `failed` reads again on new
   * credentials, a send, or `clearError`.
   */
  | { kind: "restoring"; load: "running" | "stale" | "failed" }
  | { kind: "idle" }
  /** A chat request is out and the Turn is not live yet, so a steer would be refused. `prompt` is null for a regenerate or an approval continuation. */
  | { kind: "starting"; prompt: Sent<M> | null }
  /**
   * The relay answered with a stream: the Turn is live and takes steers.
   * `finished`: the stream carried its `finish` chunk.
   */
  | { kind: "streaming"; prompt: Sent<M> | null; finished: boolean }
  /** Stored history is read again to place read steers, or to learn what a Turn that ended without `finish` stored. */
  | { kind: "reconciling" };

export interface ChatState<M extends UIMessage> {
  /** The transcript the server is known to store. The rollback target. */
  completed: M[];
  error: Error | undefined;
  /** Oldest first: every sent message not stored yet, except the running Turn's prompt. */
  outbox: Outgoing<M>[];
  phase: Phase<M>;
}

/**
 * How the AI SDK chat's request ended. `closed`: without an error or a Stop; the Turn
 * completed only if its stream carried `finish`. `sessionGone`: the relay
 * answered 404, so the Session is deleted or another End-user's.
 */
export type TurnResult<M extends UIMessage> =
  | { outcome: "closed"; messages: M[] }
  | { outcome: "stopped" }
  | { outcome: "failed"; error: Error; sessionGone: boolean };

export type ChatEvent<M extends UIMessage> =
  /** Read the stored transcript; sent by each `start()`. */
  | { type: "restore" }
  | { type: "credentialsChanged" }
  | { type: "historyLoaded"; messages: M[] }
  /** `sessionGone`: the relay answered 404, so the Session is deleted or another End-user's. */
  | { type: "historyFailed"; error: Error; sessionGone: boolean }
  | { type: "send"; sent: Sent<M> }
  | { type: "regenerate" }
  /** The user completed an approval round; the AI SDK chat sends the continuation itself. */
  | { type: "approvalAnswered" }
  | { type: "turnStarted" }
  /** The stream carried its `finish` chunk. */
  | { type: "turnFinished" }
  /** The AI SDK chat's request ended, however it ended. */
  | { type: "turnEnded"; result: TurnResult<M> }
  | { type: "steerAnswered"; requestId: string; outcome: SteerOutcome }
  /** `answerLost`: the request failed in transit, so the relay may have taken it. */
  | {
      type: "steerFailed";
      requestId: string;
      error: Error;
      answerLost: boolean;
    }
  | { type: "steerConsumed"; requestId: string }
  | { type: "stop" }
  | { type: "newSession" }
  | { type: "dispose" }
  | { type: "clearError" };

export type ChatEffect<M extends UIMessage> =
  | { type: "startTurn"; message: UserMessage<M> }
  | { type: "regenerate" }
  | { type: "submitSteer"; message: UserMessage<M>; requestId: string }
  | { type: "show"; messages: M[] }
  /** `known`: messages already known to be stored, so the read can stop at the newest page that reaches them; empty reads every page. */
  | { type: "loadHistory"; known: M[] }
  | { type: "abort" }
  /** Forget the stored Session and open a new conversation without one. */
  | { type: "forgetSession" }
  /** Resolve the `send()` promise named by `key`. */
  | { type: "settle"; key: string; landed: boolean };

export const initialChatState: ChatState<never> = {
  completed: [],
  error: undefined,
  outbox: [],
  phase: { kind: "restoring", load: "running" },
};

interface Step<M extends UIMessage> {
  effects: ChatEffect<M>[];
  state: ChatState<M>;
}

/**
 * Applies one event, then the `drain` rule. Pure and total: an event that
 * does not apply to the current phase, such as a late steer answer after a
 * rollback, leaves the state unchanged.
 * @param state - Current state.
 * @param event - What happened.
 * @param newId - Mints steer request IDs and the fresh message ID a resend gets.
 * @returns The next state and the effects to run, in order.
 */
export function step<M extends UIMessage>(
  state: ChatState<M>,
  event: ChatEvent<M>,
  newId: () => string
): Step<M> {
  return drain(apply(state, event, newId), newId);
}

/** True when idle with a stored assistant reply to replace. */
export function canRegenerate<M extends UIMessage>(
  state: ChatState<M>
): boolean {
  return (
    state.phase.kind === "idle" &&
    state.outbox.length === 0 &&
    state.completed.at(-1)?.role === "assistant" &&
    !awaitsApproval(state.completed)
  );
}

/** IDs of the messages sent but not stored yet, the running prompt included. */
export function pendingIds<M extends UIMessage>(
  state: ChatState<M>
): Set<string> {
  const ids = new Set(state.outbox.map((entry) => entry.message.id));
  const { phase } = state;
  if (
    (phase.kind === "starting" || phase.kind === "streaming") &&
    phase.prompt
  ) {
    ids.add(phase.prompt.message.id);
  }
  return ids;
}

function apply<M extends UIMessage>(
  state: ChatState<M>,
  event: ChatEvent<M>,
  newId: () => string
): Step<M> {
  const { phase } = state;
  switch (event.type) {
    case "restore":
      return {
        state: { ...state, phase: { kind: "restoring", load: "running" } },
        effects: [{ type: "loadHistory", known: [] }],
      };
    case "credentialsChanged":
      if (phase.kind === "restoring" && phase.load !== "failed") {
        return noEffects({
          ...state,
          phase: { kind: "restoring", load: "stale" },
        });
      }
      return restoreAgain(state);
    case "historyLoaded":
      return historyLoaded(state, event.messages);
    case "historyFailed":
      return historyFailed(state, event);
    case "send":
      return restoreAgain({
        ...state,
        error: undefined,
        outbox: [...state.outbox, { ...event.sent, stage: "waiting" }],
      });
    case "regenerate":
      return canRegenerate(state)
        ? {
            state: {
              ...state,
              error: undefined,
              phase: { kind: "starting", prompt: null },
            },
            effects: [{ type: "regenerate" }],
          }
        : noEffects(state);
    case "approvalAnswered":
      return phase.kind === "idle"
        ? noEffects({ ...state, phase: { kind: "starting", prompt: null } })
        : noEffects(state);
    case "turnStarted":
      // Outside `starting`, the AI SDK chat sent an approval continuation on its own.
      return noEffects({
        ...state,
        phase: {
          kind: "streaming",
          prompt: phase.kind === "starting" ? phase.prompt : null,
          finished: false,
        },
      });
    case "turnFinished":
      return phase.kind === "streaming"
        ? noEffects({ ...state, phase: { ...phase, finished: true } })
        : noEffects(state);
    case "turnEnded":
      return turnEnded(state, event.result, newId);
    case "steerAnswered":
      return noEffects({
        ...state,
        outbox: state.outbox.map((entry) =>
          entry.stage === "steering" && entry.requestId === event.requestId
            ? answered(entry, event.outcome, phase, newId)
            : entry
        ),
      });
    case "steerFailed":
      return steerFailed(state, event, newId);
    case "steerConsumed":
      return noEffects({
        ...state,
        outbox: state.outbox.map((entry) =>
          (entry.stage === "steering" || entry.stage === "accepted") &&
          entry.requestId === event.requestId
            ? { ...entry, stage: "consumed" }
            : entry
        ),
      });
    case "stop":
      return phase.kind === "starting" || phase.kind === "streaming"
        ? { state, effects: [{ type: "abort" }] }
        : noEffects(state);
    case "newSession": {
      const ended = endConversation(state);
      return {
        state: {
          completed: [],
          error: undefined,
          outbox: [],
          phase: { kind: "idle" },
        },
        effects: [...ended, { type: "forgetSession" }],
      };
    }
    case "dispose":
      return { state: initialChatState, effects: endConversation(state) };
    case "clearError":
      return restoreAgain({ ...state, error: undefined });
  }
}

/** Reads history again when the restore failed; otherwise changes nothing. */
function restoreAgain<M extends UIMessage>(state: ChatState<M>): Step<M> {
  return state.phase.kind === "restoring" && state.phase.load === "failed"
    ? {
        state: { ...state, phase: { kind: "restoring", load: "running" } },
        effects: [{ type: "loadHistory", known: [] }],
      }
    : noEffects(state);
}

function historyLoaded<M extends UIMessage>(
  state: ChatState<M>,
  messages: M[]
): Step<M> {
  if (state.phase.kind === "restoring") {
    return {
      state: {
        ...state,
        completed: messages,
        error: undefined,
        phase: { kind: "idle" },
      },
      effects: [{ type: "show", messages }],
    };
  }
  if (state.phase.kind === "reconciling") {
    const stored = new Set(messages.map((message) => message.id));
    return {
      state: {
        ...state,
        completed: messages,
        outbox: state.outbox.filter((entry) => !placedByHistory(entry)),
        phase: { kind: "idle" },
      },
      effects: [
        { type: "show", messages },
        ...settlePlaced(state, (entry) => stored.has(entry.message.id)),
      ],
    };
  }
  return noEffects(state);
}

function historyFailed<M extends UIMessage>(
  state: ChatState<M>,
  { error, sessionGone }: { error: Error; sessionGone: boolean }
): Step<M> {
  const { phase } = state;
  if (phase.kind === "restoring") {
    if (sessionGone) {
      return {
        state: {
          ...state,
          completed: [],
          error: undefined,
          phase: { kind: "idle" },
        },
        effects: [{ type: "forgetSession" }],
      };
    }
    return phase.load === "stale"
      ? {
          state: { ...state, phase: { kind: "restoring", load: "running" } },
          effects: [{ type: "loadHistory", known: [] }],
        }
      : noEffects({
          ...state,
          error,
          phase: { kind: "restoring", load: "failed" },
        });
  }
  if (phase.kind === "reconciling") {
    // A completed Turn stored its steers, but where they sit is unknown; append
    // them. What a Turn that ended without `finish` stored is unknown; roll it back.
    const completed = [
      ...state.completed,
      ...state.outbox
        .filter((entry) => entry.stage === "consumed")
        .map((entry) => entry.message),
    ];
    return {
      state: {
        ...state,
        completed,
        error,
        outbox: state.outbox.filter((entry) => !placedByHistory(entry)),
        phase: { kind: "idle" },
      },
      effects: [
        { type: "show", messages: completed },
        ...settlePlaced(state, () => false),
      ],
    };
  }
  return noEffects(state);
}

function turnEnded<M extends UIMessage>(
  state: ChatState<M>,
  result: TurnResult<M>,
  newId: () => string
): Step<M> {
  const { phase } = state;
  if (phase.kind !== "starting" && phase.kind !== "streaming") {
    return noEffects(state);
  }
  const error = result.outcome === "failed" ? result.error : undefined;
  if (result.outcome === "failed" && result.sessionGone) {
    return {
      state: { completed: [], error, outbox: [], phase: { kind: "idle" } },
      effects: [...settlePending(state), { type: "forgetSession" }],
    };
  }
  if (phase.kind === "starting") {
    // The relay never answered with a stream, so the Turn stored nothing.
    return {
      state: { ...state, error, outbox: [], phase: { kind: "idle" } },
      effects: [
        { type: "show", messages: state.completed },
        ...settlePending(state),
      ],
    };
  }
  if (result.outcome !== "closed" || !phase.finished) {
    // The Turn may have stored its prompt and steers before the stream ended.
    const outbox = [...(phase.prompt ? [phase.prompt] : []), ...state.outbox];
    return {
      state: {
        ...state,
        error,
        outbox: outbox.map(({ key, message }) => ({
          key,
          message,
          stage: "unconfirmed",
        })),
        phase: { kind: "reconciling" },
      },
      effects: [
        { type: "show", messages: state.completed },
        { type: "loadHistory", known: state.completed },
      ],
    };
  }
  // Accepted at the Turn's end without being read means the receipt is not_placed.
  const outbox = state.outbox.map((entry) =>
    entry.stage === "accepted" || entry.stage === "refused"
      ? resend(entry, newId)
      : entry
  );
  return {
    state: {
      ...state,
      completed: result.messages,
      outbox,
      // AI SDK sends a complete approval round itself right after onFinish.
      phase: lastAssistantMessageIsCompleteWithApprovalResponses({
        messages: result.messages,
      })
        ? { kind: "starting", prompt: null }
        : { kind: "idle" },
    },
    effects: phase.prompt
      ? [{ type: "settle", key: phase.prompt.key, landed: true }]
      : [],
  };
}

function steerFailed<M extends UIMessage>(
  state: ChatState<M>,
  {
    answerLost,
    error,
    requestId,
  }: { answerLost: boolean; error: Error; requestId: string },
  newId: () => string
): Step<M> {
  const failed = state.outbox.find(
    (entry) => entry.stage === "steering" && entry.requestId === requestId
  );
  if (!failed) {
    return noEffects(state);
  }
  if (answerLost) {
    // The relay may have taken it, so it counts as accepted.
    return noEffects({
      ...state,
      outbox: state.outbox.map((entry) =>
        entry === failed
          ? answered({ ...failed, requestId }, "accepted", state.phase, newId)
          : entry
      ),
    });
  }
  return {
    state: {
      ...state,
      error,
      outbox: state.outbox.filter((entry) => entry !== failed),
    },
    effects: [{ type: "settle", key: failed.key, landed: false }],
  };
}

/**
 * Where a steer goes once the relay answers. An accepted one waits while a
 * Turn is starting or streaming, since that Turn may read it and its end
 * decides. A refused one waits for the streaming Turn to end, since steering
 * it again now would only be refused again. Otherwise it is resent.
 */
function answered<M extends UIMessage>(
  entry: Sent<M> & { requestId: string },
  outcome: SteerOutcome,
  phase: Phase<M>,
  newId: () => string
): Outgoing<M> {
  if (outcome === "committed") {
    return { ...entry, stage: "consumed" };
  }
  if (
    outcome === "accepted" &&
    (phase.kind === "starting" || phase.kind === "streaming")
  ) {
    return { ...entry, stage: "accepted" };
  }
  if (outcome === "resend" && phase.kind === "streaming") {
    return { ...entry, stage: "refused" };
  }
  return resend(entry, newId);
}

function resend<M extends UIMessage>(
  { key, message }: Sent<M>,
  newId: () => string
): Outgoing<M> {
  return { key, message: { ...message, id: newId() }, stage: "waiting" };
}

/** Aborts a live Turn and resolves every pending `send()` with false. */
function endConversation<M extends UIMessage>(
  state: ChatState<M>
): ChatEffect<M>[] {
  const live =
    state.phase.kind === "starting" || state.phase.kind === "streaming";
  return [
    ...(live ? [{ type: "abort" } as const] : []),
    ...settlePending(state),
  ];
}

/** Resolves the running prompt's and every outbox entry's `send()` with false. */
function settlePending<M extends UIMessage>(
  state: ChatState<M>
): ChatEffect<M>[] {
  const { phase } = state;
  const prompt =
    (phase.kind === "starting" || phase.kind === "streaming") && phase.prompt
      ? [phase.prompt]
      : [];
  return [...prompt, ...state.outbox].map(({ key }) => ({
    type: "settle",
    key,
    landed: false,
  }));
}

/** Entries a history read settles: steers a completed Turn read, and messages of a Turn that ended without `finish`. */
function placedByHistory<M extends UIMessage>(entry: Outgoing<M>): boolean {
  return entry.stage === "consumed" || entry.stage === "unconfirmed";
}

/**
 * Resolves each entry a history read settles: a read steer as landed, an
 * unconfirmed message as `stored` says.
 */
function settlePlaced<M extends UIMessage>(
  state: ChatState<M>,
  stored: (entry: Outgoing<M>) => boolean
): ChatEffect<M>[] {
  return state.outbox.filter(placedByHistory).map((entry) => ({
    type: "settle",
    key: entry.key,
    landed: entry.stage === "consumed" || stored(entry),
  }));
}

/**
 * Moves queued messages; runs after every event. Idle: read history again
 * when it must settle an entry, else the oldest waiting message starts a
 * Turn unless a manual approval is pending. Streaming: every waiting message
 * steers. Any other phase: nothing moves.
 */
function drain<M extends UIMessage>(
  { effects, state }: Step<M>,
  newId: () => string
): Step<M> {
  if (state.phase.kind === "streaming") {
    const steers: ChatEffect<M>[] = [];
    const outbox = state.outbox.map((entry): Outgoing<M> => {
      if (entry.stage !== "waiting") {
        return entry;
      }
      const requestId = newId();
      steers.push({ type: "submitSteer", message: entry.message, requestId });
      return { ...entry, stage: "steering", requestId };
    });
    return { state: { ...state, outbox }, effects: [...effects, ...steers] };
  }
  if (state.phase.kind !== "idle") {
    return { state, effects };
  }
  if (state.outbox.some(placedByHistory)) {
    return {
      state: { ...state, phase: { kind: "reconciling" } },
      effects: [...effects, { type: "loadHistory", known: state.completed }],
    };
  }
  const next = state.outbox.find((entry) => entry.stage === "waiting");
  if (!next || awaitsApproval(state.completed)) {
    return { state, effects };
  }
  return {
    state: {
      ...state,
      outbox: state.outbox.filter((entry) => entry !== next),
      phase: {
        kind: "starting",
        prompt: { key: next.key, message: next.message },
      },
    },
    effects: [...effects, { type: "startTurn", message: next.message }],
  };
}

/** A manual Tool approval blocks the Session until it is decided. */
function awaitsApproval(messages: UIMessage[]): boolean {
  return (
    messages
      .findLast((message) => message.role === "assistant")
      ?.parts.some(
        (part) =>
          isToolUIPart(part) &&
          part.state === "approval-requested" &&
          part.approval.isAutomatic !== true
      ) === true
  );
}

function noEffects<M extends UIMessage>(state: ChatState<M>): Step<M> {
  return { state, effects: [] };
}
