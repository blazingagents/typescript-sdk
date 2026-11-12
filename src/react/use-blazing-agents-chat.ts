import { Chat, useChat } from "@ai-sdk/react";
import {
  type ChatOnFinishCallback,
  type FileUIPart,
  generateId,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BlazingAgentsChatTransport } from "../chat-transport.ts";
import { sessionIdSchema } from "../contracts/ids.ts";
import { BlazingAgentsError } from "../errors.ts";
import type { BlazingAgentsUIMessage } from "../types.ts";
import {
  type ChatEffect,
  type ChatEvent,
  type ChatState,
  canRegenerate,
  initialChatState,
  pendingIds,
  step,
  type TurnResult,
  type UserMessage,
} from "./chat-state.ts";

const DEFAULT_STORAGE_KEY = "blazing-agents-session";

export interface UseBlazingAgentsChatOptions {
  /** The app's relay endpoint: `createChatRelay`, or a relay in another language. Default `/api/chat`. */
  api?: string;
  credentials?: RequestCredentials;
  fetch?: typeof globalThis.fetch;
  /**
   * Request headers, read at request time, so a new token applies to the next
   * request. When their values change while history could not be read, the
   * hook reads it again, as it does on the next `send` or `clearError`.
   */
  headers?: Record<string, string> | Headers;
  /**
   * localStorage key for the Session ID. Default `blazing-agents-session`;
   * `null` keeps the Session in memory only, as does storage that throws.
   * Read after mount, so server rendering never touches storage.
   */
  storageKey?: string | null;
}

export interface BlazingAgentsChat<
  M extends UIMessage = BlazingAgentsUIMessage,
> {
  /**
   * Answers a pending Tool approval. Once every approval of the round is
   * answered, the continuation streams like any Turn.
   * @param response - The approval ID, the decision, and an optional reason.
   */
  addToolApprovalResponse(response: {
    approved: boolean;
    id: string;
    reason?: string;
  }): void;
  /** True when idle with a stored assistant reply to replace. */
  readonly canRegenerate: boolean;
  /** Clears `error`. When history could not be read, also reads it again. */
  clearError(): void;
  /** The last failure: a failed Turn, steer, or history read. Cleared by the next send. */
  readonly error: Error | undefined;
  /** What to render, oldest first: the stored transcript, the streaming reply, and sent messages not stored yet. */
  readonly messages: readonly M[];
  /** Cancels any running Turn, forgets the stored Session, and clears the transcript. */
  newSession(): void;
  /** IDs in `messages` that are sent but not stored yet. */
  readonly pendingIds: ReadonlySet<string>;
  /** Replaces the last assistant reply. Does nothing unless `canRegenerate`. */
  regenerate(): void;
  /**
   * Sends a user message. Idle: starts a Turn. While a Turn runs: steers into
   * it, or sends it as the next Turn when this one cannot take it. Never sends
   * a message twice.
   * @param input - Text, or text with files.
   * @returns Resolves true once the message is stored in the Session, and false when it was rolled back by an error, Stop, or New Session. Never rejects.
   */
  send(
    input: string | { files?: FileUIPart[]; text: string }
  ): Promise<boolean>;
  /** The Session, once restored or minted by the first reply. */
  readonly sessionId: string | undefined;
  /**
   * `restoring`: reading the stored transcript, or, after that read failed
   * (see `error`), waiting for new `headers`, a `send`, or `clearError` to
   * read it again. `running`: a Turn is starting, streaming, or being placed
   * in stored history. `send` works in every status.
   */
  readonly status: "restoring" | "idle" | "running";
  /** Cancels the running Turn and rolls back to the stored transcript. */
  stop(): void;
}

/**
 * A Blazing Agents chat through the app's relay, with the Session kept in
 * localStorage, history restored after a reload, steering while a reply
 * streams, and rollback on failure.
 * @param options - Relay endpoint, request options, and storage key.
 * @returns The chat; see `BlazingAgentsChat`.
 */
export function useBlazingAgentsChat<
  M extends UIMessage = BlazingAgentsUIMessage,
>(options: UseBlazingAgentsChatOptions = {}): BlazingAgentsChat<M> {
  const latest = useRef(options);
  latest.current = options;
  const [store] = useState(() => createChatStore<M>(latest));
  const { conversation, sessionId, state } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  const { messages: shown } = useChat<M>({ chat: conversation.chat });
  const credentialsKey = headersKey(options.headers);

  useEffect(() => {
    store.mount();
    return store.unmount;
  }, [store]);
  useEffect(() => {
    store.credentialsChanged(credentialsKey);
  }, [store, credentialsKey]);

  const messages = useMemo(() => {
    const ids = new Set(shown.map((message) => message.id));
    return [
      ...shown,
      ...state.outbox
        .map((entry) => entry.message)
        .filter((message) => !ids.has(message.id)),
    ];
  }, [shown, state.outbox]);
  const pending = useMemo(() => pendingIds(state), [state]);

  return {
    addToolApprovalResponse: store.addToolApprovalResponse,
    canRegenerate: canRegenerate(state),
    clearError: store.clearError,
    error: state.error,
    messages,
    newSession: store.newSession,
    pendingIds: pending,
    regenerate: store.regenerate,
    send: store.send,
    sessionId,
    status: statusOf(state),
    stop: store.stop,
  };
}

function statusOf<M extends UIMessage>(
  state: ChatState<M>
): BlazingAgentsChat<M>["status"] {
  if (state.phase.kind === "restoring" || state.phase.kind === "idle") {
    return state.phase.kind;
  }
  return "running";
}

/** Runs one localStorage call. Where storage throws, as when the browser blocks it or it is full, the Session lives in memory only. */
function tryStorage<T>(use: (storage: Storage) => T): T | undefined {
  try {
    return use(localStorage);
  } catch {
    return undefined;
  }
}

/** Header values as one comparable string, so a re-created but equal object is no change. */
function headersKey(headers: UseBlazingAgentsChatOptions["headers"]): string {
  return JSON.stringify([...new Headers(headers)]);
}

/** One Session's AI SDK state. Replaced on restore and New Session; `epoch` drops late events from a replaced one. */
interface Conversation<M extends UIMessage> {
  readonly chat: Chat<M>;
  readonly epoch: number;
  readonly transport: BlazingAgentsChatTransport<M>;
}

interface Snapshot<M extends UIMessage> {
  readonly conversation: Conversation<M>;
  readonly sessionId: string | undefined;
  readonly state: ChatState<M>;
}

/**
 * Holds `ChatState` and the current conversation, runs `step` synchronously
 * (so two sends in one tick see different states), then runs its effects.
 */
function createChatStore<M extends UIMessage>(options: {
  readonly current: UseBlazingAgentsChatOptions;
}) {
  const listeners = new Set<() => void>();
  const settlers = new Map<string, (landed: boolean) => void>();
  let credentials = headersKey(options.current.headers);
  let epoch = 0;
  let state: ChatState<M> = initialChatState;
  let conversation = open(undefined);
  let snapshot: Snapshot<M> = { conversation, sessionId: undefined, state };

  function storageKey(): string | null {
    return options.current.storageKey === undefined
      ? DEFAULT_STORAGE_KEY
      : options.current.storageKey;
  }

  function publish() {
    snapshot = {
      conversation,
      sessionId: conversation.transport.sessionId,
      state,
    };
    for (const listener of listeners) {
      listener();
    }
  }

  function open(sessionId: string | undefined): Conversation<M> {
    epoch += 1;
    const opened = epoch;
    const transport = new BlazingAgentsChatTransport<M>({
      api: options.current.api,
      credentials: options.current.credentials,
      fetch: options.current.fetch,
      headers: () => options.current.headers ?? {},
      onSessionId: (id) => {
        const key = storageKey();
        if (key !== null) {
          tryStorage((storage) => storage.setItem(key, id));
        }
        publish();
      },
      onSteerConsumed: (requestId) =>
        dispatch({ type: "steerConsumed", requestId }, opened),
      onTurnFinish: () => dispatch({ type: "turnFinished" }, opened),
      onTurnStart: () => dispatch({ type: "turnStarted" }, opened),
      sessionId,
    });
    const chat: Chat<M> = new Chat<M>({
      id: `blazing-agents-${opened}`,
      onFinish: (event) =>
        dispatch(
          { type: "turnEnded", result: turnResult(event, chat) },
          opened
        ),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
      transport,
    });
    return { chat, epoch: opened, transport };
  }

  function dispatch(event: ChatEvent<M>, from = epoch) {
    if (from !== epoch) {
      return;
    }
    const next = step(state, event, generateId);
    state = next.state;
    publish();
    for (const effect of next.effects) {
      run(effect);
    }
  }

  function run(effect: ChatEffect<M>) {
    const { chat, transport, epoch: at } = conversation;
    switch (effect.type) {
      case "startTurn":
        chat.sendMessage(effect.message);
        return;
      case "regenerate":
        chat.regenerate();
        return;
      case "submitSteer":
        transport
          .steer({ message: effect.message, requestId: effect.requestId })
          .then(
            (outcome) =>
              dispatch(
                { type: "steerAnswered", requestId: effect.requestId, outcome },
                at
              ),
            (error: Error) =>
              dispatch(
                {
                  type: "steerFailed",
                  requestId: effect.requestId,
                  error,
                  answerLost:
                    BlazingAgentsError.isInstance(error) &&
                    error.code === "network_error",
                },
                at
              )
          );
        return;
      case "show":
        chat.messages = effect.messages;
        return;
      case "loadHistory":
        transport.loadHistory().then(
          (messages) => dispatch({ type: "historyLoaded", messages }, at),
          (error: Error) =>
            dispatch(
              { type: "historyFailed", error, sessionGone: sessionGone(error) },
              at
            )
        );
        return;
      case "abort":
        chat.stop();
        return;
      case "forgetSession": {
        const key = storageKey();
        if (key !== null) {
          tryStorage((storage) => storage.removeItem(key));
        }
        conversation = open(undefined);
        publish();
        return;
      }
      case "settle":
        settlers.get(effect.key)?.(effect.landed);
        settlers.delete(effect.key);
        return;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    mount() {
      const key = storageKey();
      const stored = sessionIdSchema.safeParse(
        key === null ? null : tryStorage((storage) => storage.getItem(key))
      );
      // A remount keeps the Session in memory when storage holds none.
      conversation = open(
        stored.success ? stored.data : conversation.transport.sessionId
      );
      publish();
      dispatch({ type: "restore" });
    },
    unmount: () => dispatch({ type: "unmount" }),
    credentialsChanged(key: string) {
      if (key !== credentials) {
        credentials = key;
        dispatch({ type: "credentialsChanged" });
      }
    },
    send(input: string | { files?: FileUIPart[]; text: string }) {
      const { files = [], text } =
        typeof input === "string" ? { text: input } : input;
      const message = {
        id: generateId(),
        role: "user",
        parts: [...files, { type: "text", text }],
      } as UserMessage<M>;
      return new Promise<boolean>((resolve) => {
        settlers.set(message.id, resolve);
        dispatch({ type: "send", sent: { key: message.id, message } });
      });
    },
    regenerate: () => dispatch({ type: "regenerate" }),
    stop: () => dispatch({ type: "stop" }),
    newSession: () => dispatch({ type: "newSession" }),
    clearError: () => dispatch({ type: "clearError" }),
    addToolApprovalResponse(response: {
      approved: boolean;
      id: string;
      reason?: string;
    }) {
      const { chat, epoch: at } = conversation;
      Promise.resolve(chat.addToolApprovalResponse(response)).then(() => {
        if (
          lastAssistantMessageIsCompleteWithApprovalResponses({
            messages: chat.messages,
          })
        ) {
          dispatch({ type: "approvalAnswered" }, at);
        }
      });
    },
  };
}

function turnResult<M extends UIMessage>(
  {
    finishReason,
    isAbort,
    isError,
    messages,
  }: Parameters<ChatOnFinishCallback<M>>[0],
  chat: Chat<M>
): TurnResult<M> {
  if (isAbort) {
    return { outcome: "stopped" };
  }
  if (isError || finishReason === "error") {
    const error = chat.error ?? new Error("The reply failed.");
    return { outcome: "failed", error, sessionGone: sessionGone(error) };
  }
  return { outcome: "closed", messages };
}

/** The relay answers 404 for a deleted Session or another End-user's. */
function sessionGone(error: Error): boolean {
  return BlazingAgentsError.isInstance(error) && error.status === 404;
}
