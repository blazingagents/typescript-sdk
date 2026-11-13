import {
  AbstractChat,
  type ChatState as AbstractChatState,
  type ChatOnFinishCallback,
  type FileUIPart,
  generateId,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
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
import { BlazingAgentsChatTransport } from "./chat-transport.ts";
import { sessionIdSchema } from "./contracts/ids.ts";
import { BlazingAgentsError } from "./errors.ts";
import type { BlazingAgentsUIMessage } from "./types.ts";

const DEFAULT_STORAGE_KEY = "blazing-agents-session";

export interface BlazingAgentsChatOptions {
  /** The app's relay endpoint: `createChatRelay`, or a relay in another language. Default `/api/chat`. */
  api?: string;
  credentials?: RequestCredentials;
  fetch?: typeof globalThis.fetch;
  /** Request headers, or a function that returns them, read at each request. Replace them with `setHeaders`. */
  headers?:
    | Record<string, string>
    | Headers
    | (() => Record<string, string> | Headers);
  /**
   * localStorage key for the Session ID. Default `blazing-agents-session`;
   * `null` keeps the Session in memory only, as does storage that throws.
   * Read by `start()`, never by the constructor, so server rendering never
   * touches storage.
   */
  storageKey?: string | null;
}

/**
 * What to render. `getSnapshot()` returns the same object until a field
 * changes, so `useSyncExternalStore` and signals can compare by identity.
 */
export interface BlazingAgentsChatSnapshot<
  M extends UIMessage = BlazingAgentsUIMessage,
> {
  /** True when idle with a stored assistant reply to replace. */
  readonly canRegenerate: boolean;
  /** The last failure: a failed Turn, steer, or history read. Cleared by the next send. */
  readonly error: Error | undefined;
  /** Oldest first: the stored transcript, the streaming reply, and sent messages not stored yet. */
  readonly messages: readonly M[];
  /** IDs in `messages` that are sent but not stored yet. */
  readonly pendingIds: ReadonlySet<string>;
  /** The Session, once restored or minted by the first reply. */
  readonly sessionId: string | undefined;
  /**
   * `restoring`: reading the stored transcript, or, after that read failed
   * (see `error`), waiting for new headers, a `send`, or `clearError` to read
   * it again. `running`: a Turn is starting, streaming, or being placed in
   * stored history. `send` works in every status.
   */
  readonly status: "restoring" | "idle" | "running";
}

/** The AI SDK's framework-neutral chat, run over `chatMessages` state. */
class ConversationChat<M extends UIMessage> extends AbstractChat<M> {}

/** One Session's AI SDK chat. Replaced on start and New Session; `epoch` drops late events from a replaced one. */
interface Conversation<M extends UIMessage> {
  readonly chat: ConversationChat<M>;
  readonly epoch: number;
  readonly transport: BlazingAgentsChatTransport<M>;
}

/**
 * A Blazing Agents chat through the app's relay, for any UI framework: the
 * Session kept in localStorage, history restored after a reload, steering
 * while a reply streams, and rollback on failure. Render `getSnapshot()` and
 * re-read it whenever a `subscribe` listener runs. Call `start()` once the
 * chat is mounted in a browser and `dispose()` when it unmounts; `start()`
 * may follow `dispose()` again. Every method is bound, so it can be passed as
 * a callback.
 */
export class BlazingAgentsChat<M extends UIMessage = BlazingAgentsUIMessage> {
  readonly #listeners = new Set<() => void>();
  readonly #options: BlazingAgentsChatOptions;
  /** Events to step, oldest first; the head is the one stepping now. */
  readonly #queue: ChatEvent<M>[] = [];
  readonly #settlers = new Map<string, (landed: boolean) => void>();
  readonly #storageKey: string | null;
  #conversation: Conversation<M>;
  #epoch = 0;
  #headers: BlazingAgentsChatOptions["headers"];
  /** The values of the headers last given, so `setHeaders` sees a change made inside the same `Headers` object. */
  #headersKey: string;
  #snapshot: BlazingAgentsChatSnapshot<M> = {
    canRegenerate: false,
    error: undefined,
    messages: [],
    pendingIds: new Set(),
    sessionId: undefined,
    status: "restoring",
  };
  #started = false;
  #state: ChatState<M> = initialChatState;

  /**
   * Creates the chat without touching storage or the network.
   * @param options - Relay endpoint, request options, and storage key.
   */
  constructor(options: BlazingAgentsChatOptions = {}) {
    this.#options = options;
    this.#headers = options.headers;
    this.#headersKey = headersKey(options.headers);
    this.#storageKey =
      options.storageKey === undefined
        ? DEFAULT_STORAGE_KEY
        : options.storageKey;
    this.#conversation = this.#open(undefined);
  }

  /**
   * Runs `listener` after each change to the snapshot.
   * @param listener - Re-reads `getSnapshot()`.
   * @returns Removes the listener.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** @returns What to render now. */
  readonly getSnapshot = (): BlazingAgentsChatSnapshot<M> => this.#snapshot;

  /** Reads the stored Session from localStorage and restores its transcript. Does nothing when already started. */
  readonly start = (): void => {
    if (this.#started) {
      return;
    }
    this.#started = true;
    const key = this.#storageKey;
    const stored = sessionIdSchema.safeParse(
      key === null ? null : tryStorage((storage) => storage.getItem(key))
    );
    // A restart keeps the Session in memory when storage holds none.
    this.#conversation = this.#open(
      stored.success ? stored.data : this.#conversation.transport.sessionId
    );
    this.#dispatch({ type: "restore" });
  };

  /** Cancels the running Turn and resolves every pending `send()` with false. Answers still in flight change nothing. */
  readonly dispose = (): void => {
    this.#started = false;
    this.#dispatch({ type: "dispose" });
    this.#epoch += 1;
  };

  /**
   * Replaces the request headers, so a new token applies to the next request.
   * When their values differ from the last ones given, even inside the same
   * `Headers` object, and history could not be read, reads it again, as the
   * next `send` or `clearError` does.
   * @param headers - The headers every later request carries, or a function that returns them.
   */
  readonly setHeaders = (
    headers: BlazingAgentsChatOptions["headers"]
  ): void => {
    this.#headers = headers;
    const key = headersKey(headers);
    if (key !== this.#headersKey) {
      this.#headersKey = key;
      this.#dispatch({ type: "credentialsChanged" });
    }
  };

  /**
   * Sends a user message. Idle: starts a Turn. While a Turn runs: steers into
   * it, or sends it as the next Turn when this one cannot take it. Never sends
   * a message twice.
   * @param input - Text, or text with files.
   * @returns Resolves true once the message is stored in the Session, and false when it was rolled back by an error, Stop, New Session, or `dispose()`. Never rejects.
   */
  readonly send = (
    input: string | { files?: FileUIPart[]; text: string }
  ): Promise<boolean> => {
    const { files = [], text } =
      typeof input === "string" ? { text: input } : input;
    const message = {
      id: generateId(),
      role: "user",
      parts: [...files, { type: "text", text }],
    } as UserMessage<M>;
    return new Promise<boolean>((resolve) => {
      this.#settlers.set(message.id, resolve);
      this.#dispatch({ type: "send", sent: { key: message.id, message } });
    });
  };

  /** Replaces the last assistant reply. Does nothing unless `canRegenerate`. */
  readonly regenerate = (): void => this.#dispatch({ type: "regenerate" });

  /** Cancels the running Turn and rolls back to the stored transcript. */
  readonly stop = (): void => this.#dispatch({ type: "stop" });

  /** Cancels any running Turn, forgets the stored Session, and clears the transcript. */
  readonly newSession = (): void => this.#dispatch({ type: "newSession" });

  /** Clears `error`. When history could not be read, also reads it again. */
  readonly clearError = (): void => this.#dispatch({ type: "clearError" });

  /**
   * Answers a pending Tool approval. Once every approval of the round is
   * answered, the continuation streams like any Turn.
   * @param response - The approval ID, the decision, and an optional reason.
   */
  readonly addToolApprovalResponse = (response: {
    approved: boolean;
    id: string;
    reason?: string;
  }): void => {
    const { chat, epoch: at } = this.#conversation;
    Promise.resolve(chat.addToolApprovalResponse(response)).then(() => {
      if (
        lastAssistantMessageIsCompleteWithApprovalResponses({
          messages: chat.messages,
        })
      ) {
        this.#dispatch({ type: "approvalAnswered" }, at);
      }
    });
  };

  #open(sessionId: string | undefined): Conversation<M> {
    this.#epoch += 1;
    const opened = this.#epoch;
    const transport = new BlazingAgentsChatTransport<M>({
      api: this.#options.api,
      credentials: this.#options.credentials,
      fetch: this.#options.fetch,
      headers: () => readHeaders(this.#headers) ?? {},
      onSessionId: (id) => {
        const key = this.#storageKey;
        if (key !== null) {
          tryStorage((storage) => storage.setItem(key, id));
        }
        this.#publish();
      },
      onSteerConsumed: (requestId) =>
        this.#dispatch({ type: "steerConsumed", requestId }, opened),
      onTurnFinish: () => this.#dispatch({ type: "turnFinished" }, opened),
      onTurnStart: () => this.#dispatch({ type: "turnStarted" }, opened),
      sessionId,
    });
    const chat: ConversationChat<M> = new ConversationChat<M>({
      id: `blazing-agents-${opened}`,
      onFinish: (event) =>
        this.#dispatch(
          { type: "turnEnded", result: turnResult(event, chat) },
          opened
        ),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
      state: chatMessages(() => this.#publish()),
      transport,
    });
    return { chat, epoch: opened, transport };
  }

  /**
   * Steps `event` synchronously, so two sends in one tick see different
   * states, runs its effects, then publishes once. An event dispatched
   * meanwhile, such as a `send()` from a listener, waits until then, so no
   * listener sees a state whose effects have not run and no effect overwrites
   * a later event's.
   */
  #dispatch(event: ChatEvent<M>, from = this.#epoch): void {
    if (from !== this.#epoch) {
      return;
    }
    this.#queue.push(event);
    if (this.#queue.length > 1) {
      return;
    }
    try {
      for (let next = this.#queue[0]; next; next = this.#queue[0]) {
        const stepped = step(this.#state, next, generateId);
        this.#state = stepped.state;
        for (const effect of stepped.effects) {
          this.#run(effect);
        }
        this.#notify();
        this.#queue.shift();
      }
    } finally {
      // A listener that throws must not leave the queue blocked.
      this.#queue.length = 0;
    }
  }

  #run(effect: ChatEffect<M>): void {
    const { chat, transport, epoch: at } = this.#conversation;
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
              this.#dispatch(
                { type: "steerAnswered", requestId: effect.requestId, outcome },
                at
              ),
            (error: Error) =>
              this.#dispatch(
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
          (messages) => this.#dispatch({ type: "historyLoaded", messages }, at),
          (error: Error) =>
            this.#dispatch(
              { type: "historyFailed", error, sessionGone: sessionGone(error) },
              at
            )
        );
        return;
      case "abort":
        chat.stop();
        return;
      case "forgetSession": {
        const key = this.#storageKey;
        if (key !== null) {
          tryStorage((storage) => storage.removeItem(key));
        }
        this.#conversation = this.#open(undefined);
        return;
      }
      case "settle":
        this.#settlers.get(effect.key)?.(effect.landed);
        this.#settlers.delete(effect.key);
        return;
    }
  }

  /** Publishes a change made outside a dispatch, such as a streamed chunk; a dispatch publishes once its effects ran. */
  #publish(): void {
    if (this.#queue.length === 0) {
      this.#notify();
    }
  }

  #notify(): void {
    const previous = this.#snapshot;
    const next = nextSnapshot(previous, this.#state, this.#conversation);
    if (next === previous) {
      return;
    }
    this.#snapshot = next;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** The previous snapshot when nothing a renderer reads changed, else a new one. */
function nextSnapshot<M extends UIMessage>(
  previous: BlazingAgentsChatSnapshot<M>,
  state: ChatState<M>,
  { chat, transport }: Conversation<M>
): BlazingAgentsChatSnapshot<M> {
  const shown = new Set(chat.messages.map((message) => message.id));
  const messages = [
    ...chat.messages,
    ...state.outbox
      .map((entry) => entry.message)
      .filter((message) => !shown.has(message.id)),
  ];
  const pending = pendingIds(state);
  const next: BlazingAgentsChatSnapshot<M> = {
    canRegenerate: canRegenerate(state),
    error: state.error,
    messages: sameItems(previous.messages, messages)
      ? previous.messages
      : messages,
    pendingIds: sameItems(previous.pendingIds, pending)
      ? previous.pendingIds
      : pending,
    sessionId: transport.sessionId,
    status:
      state.phase.kind === "restoring" || state.phase.kind === "idle"
        ? state.phase.kind
        : "running",
  };
  const unchanged =
    next.canRegenerate === previous.canRegenerate &&
    next.error === previous.error &&
    next.messages === previous.messages &&
    next.pendingIds === previous.pendingIds &&
    next.sessionId === previous.sessionId &&
    next.status === previous.status;
  return unchanged ? previous : next;
}

function sameItems<T>(left: Iterable<T>, right: Iterable<T>): boolean {
  const a = [...left];
  const b = [...right];
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * The AI SDK chat's state. Each change replaces the array, so a snapshot
 * that holds the old one never sees it change, then runs `onChange`.
 */
function chatMessages<M extends UIMessage>(
  onChange: () => void
): AbstractChatState<M> {
  let messages: M[] = [];
  const replace = (next: M[]) => {
    messages = next;
    onChange();
  };
  return {
    error: undefined,
    status: "ready",
    get messages() {
      return messages;
    },
    set messages(next) {
      replace([...next]);
    },
    pushMessage: (message) => replace([...messages, copyMessage(message)]),
    popMessage: () => replace(messages.slice(0, -1)),
    replaceMessage: (index, message) =>
      replace(messages.with(index, copyMessage(message))),
    // Once per request: the message a reply continues, which the stream then
    // mutates. Browsers throw "Illegal invocation" when structuredClone is called as a method.
    snapshot: (value) => structuredClone(value),
  };
}

/** Copies a message and its parts, which the AI SDK's streaming state mutates in place. */
function copyMessage<M extends UIMessage>(message: M): M {
  return { ...message, parts: message.parts.map((part) => ({ ...part })) };
}

/** Runs one localStorage call. Where storage throws, as when the browser blocks it or it is full, the Session lives in memory only. */
function tryStorage<T>(use: (storage: Storage) => T): T | undefined {
  try {
    return use(localStorage);
  } catch {
    return undefined;
  }
}

function readHeaders(headers: BlazingAgentsChatOptions["headers"]) {
  return typeof headers === "function" ? headers() : headers;
}

/** Header values as one comparable string, so a re-created but equal object is no change. */
function headersKey(headers: BlazingAgentsChatOptions["headers"]): string {
  return JSON.stringify([...new Headers(readHeaders(headers))]);
}

function turnResult<M extends UIMessage>(
  {
    finishReason,
    isAbort,
    isError,
    messages,
  }: Parameters<ChatOnFinishCallback<M>>[0],
  chat: ConversationChat<M>
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
