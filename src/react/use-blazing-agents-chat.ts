import type { UIMessage } from "ai";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BlazingAgentsChat,
  type BlazingAgentsChatOptions,
  type BlazingAgentsChatSnapshot,
} from "../chat-controller.ts";
import type { BlazingAgentsUIMessage } from "../types.ts";

export type UseBlazingAgentsChatOptions = Omit<
  BlazingAgentsChatOptions,
  "headers"
> & {
  /** Request headers, read at each request. */
  headers?: Record<string, string> | Headers;
};

/** The chat's snapshot and its actions; see `BlazingAgentsChat`. */
export type UseBlazingAgentsChatResult<
  M extends UIMessage = BlazingAgentsUIMessage,
> = BlazingAgentsChatSnapshot<M> &
  Pick<
    BlazingAgentsChat<M>,
    | "addToolApprovalResponse"
    | "clearError"
    | "newSession"
    | "regenerate"
    | "send"
    | "stop"
  >;

/**
 * A Blazing Agents chat through the app's relay: one `BlazingAgentsChat` per
 * component, started after mount and disposed on unmount. New `headers`, or
 * new values in the same `Headers` object, apply to the next request, even one
 * a child's effect sends in the same commit; the other options are read on the
 * first render.
 * @param options - Relay endpoint, request options, and storage key.
 * @returns The chat's snapshot and its actions.
 */
export function useBlazingAgentsChat<
  M extends UIMessage = BlazingAgentsUIMessage,
>(options: UseBlazingAgentsChatOptions = {}): UseBlazingAgentsChatResult<M> {
  const headers = useRef(options.headers);
  headers.current = options.headers;
  const [readHeaders] = useState(() => () => headers.current ?? {});
  const [chat] = useState(
    () => new BlazingAgentsChat<M>({ ...options, headers: readHeaders })
  );
  const snapshot = useSyncExternalStore(
    chat.subscribe,
    chat.getSnapshot,
    chat.getSnapshot
  );
  useEffect(() => {
    chat.start();
    return chat.dispose;
  }, [chat]);
  // After every commit, since header values can change inside the same object.
  useEffect(() => chat.setHeaders(readHeaders));
  return useMemo(
    () => ({
      ...snapshot,
      addToolApprovalResponse: chat.addToolApprovalResponse,
      clearError: chat.clearError,
      newSession: chat.newSession,
      regenerate: chat.regenerate,
      send: chat.send,
      stop: chat.stop,
    }),
    [chat, snapshot]
  );
}
