import type { UIMessage, UIMessageChunk } from "ai";
import type { ApiErrorCode } from "./contracts/api.ts";
import type { BlazingAgentsChatMessageMetadata } from "./contracts/entities/chat.ts";
import type { ChatSteerConsumedEvent } from "./contracts/entities/session-inputs.ts";
import type {
  ToolApprovalDecision,
  TurnStreamErrorEvent,
} from "./contracts/entities/sessions.ts";
import type { ChatFunctions } from "./functions.ts";
import type { UserAgentsResource } from "./resources/agents.ts";
import type { ArtifactsResource } from "./resources/artifacts.ts";
import type { MemoriesResource } from "./resources/memories.ts";
import type { PromptsResource } from "./resources/prompts.ts";
import type { SessionsResource } from "./resources/sessions.ts";
import type { AgentSkillsResource } from "./resources/skills.ts";
import type { TasksResource } from "./resources/tasks.ts";
import type { UsageResource } from "./resources/usage.ts";
import type { WorkspacesResource } from "./resources/workspaces.ts";

export type KnownBlazingAgentsErrorCode =
  | ApiErrorCode
  | "credential_echo"
  | "invalid_response"
  | "network_error"
  | "request_aborted"
  | "stream_error";

export type BlazingAgentsErrorCode =
  | KnownBlazingAgentsErrorCode
  | (string & {});

export type BlazingAgentsFetch = (
  input: string,
  init?: BlazingAgentsRequestInit
) => Promise<Response>;

export interface BlazingAgentsRequestInit extends RequestInit {
  /** Widened so multipart uploads can pass a `FormData` body. */
  body?: BodyInit | FormData | null;
}

export interface RequestOptions {
  // The raw body override (used by multipart uploads).
  body?: BodyInit | FormData | null;
  // Caller-owned correlation sent as `X-Client-Request-Id`.
  clientRequestId?: string | undefined;
  /**
   * Set on operations the contract marks `x-credential-bearing`: a 2xx JSON
   * body that contains a credential field is discarded and rejected.
   */
  credentialBearing?: true;
  /**
   * Extra headers (e.g. `Content-Type: multipart/form-data` is set
   * automatically by `fetch` when given a `FormData` body).
   */
  headers?: Record<string, string>;
  // Multipart uploads bypass this and pass `FormData` via `body`.
  json?: unknown;
  // The HTTP method (default `GET`).
  method?: string;
  /**
   * Query params appended to the path. `undefined`/`null` values are
   * skipped. Values are scalar — stringified with `String()`. No `/v1`
   * endpoint accepts repeated keys, so array values are not supported.
   */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

export interface HttpConfig {
  apiKey: string;
  baseUrl: string;
  clientRequestId?: string;
  fetch?: BlazingAgentsFetch;
  onResponse?: ((response: ResponseObservation) => void) | undefined;
  scopeUserId?: string;
}

export interface BlazingAgentsOptions {
  apiKey: string;
  baseUrl?: string;
  clientRequestId?: string;
  fetch?: HttpConfig["fetch"];
  onResponse?: HttpConfig["onResponse"];
}

export interface BlazingAgentsRequestOptions {
  clientRequestId: string;
}

export interface UserClient {
  /**
   * Returns the Skill operations for the selected Agent.
   * @param input - `agentId`.
   * @returns The selected Agent Skill client.
   */
  agent(input: { agentId: string }): AgentClient;
  readonly agents: UserAgentsResource;
  readonly artifacts: ArtifactsResource;
  /**
   * Creates or resumes a Session and returns its SSE stream and Session ID.
   * @param input - Agent, message or stored Prompt, and optional existing Session.
   * @returns The Session ID promise and single-owner SSE accessors.
   */
  chat(input: ChatInput): Promise<ChatResult>;
  /**
   * Starts stateless text generation with independent final, incremental, and response outputs.
   * @param input - Agent and literal prompt or stored Prompt reference.
   * @returns Independent text stream, final text promise, and response relay.
   */
  completion(input: CompletionInput): Promise<CompletionResult>;
  /**
   * Submits a complete Tool approval round and streams its continuation.
   * @param input - Agent, Session, and decisions for the complete approval round.
   * @returns The Session ID promise and continuation SSE accessors.
   */
  continueChat(input: ContinueChatInput): Promise<ChatResult>;
  readonly memories: MemoriesResource;
  /**
   * Starts stateless JSON generation with partial objects and a final parsed value.
   * @param input - Agent, prompt source, and JSON output schema.
   * @returns Partial JSON objects, a final JSON promise, and a text response relay.
   */
  object(input: ObjectInput): Promise<ObjectResult>;
  readonly prompts: PromptsResource;
  readonly sessions: SessionsResource;
  readonly tasks: TasksResource;
  readonly usage: Pick<UsageResource, "get" | "getForAgent" | "sessions">;
  /**
   * Creates a client view with the supplied request correlation ID.
   * @param options - Caller-owned request correlation ID for subsequent calls.
   * @returns A new client carrying the supplied correlation ID.
   */
  withOptions(options: BlazingAgentsRequestOptions): UserClient;
  readonly workspaces: WorkspacesResource;
}

export interface ResponseObservation {
  clientRequestId?: string;
  durationMs: number;
  method: string;
  path: string;
  requestId?: string;
  status: number;
}

export type ChatTrigger = "submit-message" | "regenerate-message";

export type BlazingAgentsUIMessageData = Record<
  "ba-steer-consumed",
  ChatSteerConsumedEvent["data"]
> &
  Record<"ba-error", TurnStreamErrorEvent["data"]>;

export type BlazingAgentsUIMessage = UIMessage<
  BlazingAgentsChatMessageMetadata,
  BlazingAgentsUIMessageData
>;
export type BlazingAgentsUIMessageChunk = UIMessageChunk<
  BlazingAgentsChatMessageMetadata,
  BlazingAgentsUIMessageData
>;

/**
 * End-user attribution (ADR-0001) carried on every generation request.
 * `userId` defaults to `''` (tenant-level) server-side; `metadata` is an
 * arbitrary json object the tenant can use to tag the turn.
 */
export interface AttributionInput {
  metadata?: Record<string, unknown>;
  userId?: string;
}

interface CorrelatedRequestInput {
  clientRequestId?: string;
}

interface NewSessionInput {
  sessionId?: never;
  trigger?: "submit-message";
}

interface ExistingSessionInput {
  sessionId: string;
  trigger?: ChatTrigger;
}

type ChatSessionInput = NewSessionInput | ExistingSessionInput;

interface ChatMessageContentInput
  extends AttributionInput,
    CorrelatedRequestInput {
  abortSignal?: AbortSignal;
  agentId: string;
  /** Caller-local functions for this invocation; handlers run in this process. */
  functions?: ChatFunctions;
  message: UIMessage;
  messageId?: string;
  messages?: never;
  promptId?: never;
  variables?: never;
}

interface ChatPromptContentInput
  extends AttributionInput,
    CorrelatedRequestInput {
  abortSignal?: AbortSignal;
  agentId: string;
  /** Caller-local functions for this invocation; handlers run in this process. */
  functions?: ChatFunctions;
  message?: never;
  messageId?: string;
  messages?: never;
  promptId: string;
  variables?: Record<string, string>;
}

export type ChatMessageInput = ChatMessageContentInput & ChatSessionInput;
export type ChatPromptInput = ChatPromptContentInput & ChatSessionInput;
export type ChatMessagesInput = Omit<
  ChatMessageContentInput,
  "message" | "messages"
> & { message?: never; messages: UIMessage[] } & ChatSessionInput;
export type ChatInput = ChatMessageInput | ChatMessagesInput | ChatPromptInput;

/** Records the complete approval round and streams the continuation. */
export interface ContinueChatInput extends CorrelatedRequestInput {
  abortSignal?: AbortSignal;
  agentId: string;
  decisions: ToolApprovalDecision[];
  functions?: ChatFunctions;
  sessionId: string;
}

export interface ChatResult {
  requestId?: string;
  /**
   * Resolves to the session id of this chat — the server-minted `ss_` id
   * read from the `Location` header on the create path, or the passed
   * `sessionId` on resume. The tenant persists this id and reuses it to
   * resume.
   */
  sessionId: Promise<string>;
  /**
   * Claims the response relay once and returns its HTTP response.
   * @returns The response relay.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
  toResponse: () => Response;
  /**
   * Claims the SSE bytes once, without constructing a Response. Shares ownership with toResponse().
   * @returns The SSE byte stream.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
  toStream: () => ReadableStream<Uint8Array>;
  /**
   * Resolves to the id of the Turn this response runs, read from the
   * `X-BA-Turn-Id` header. Pass it to `sessions.stop()` to stop the Turn.
   * Rejects with `stream_error` when the header is missing or malformed.
   */
  turnId: Promise<string>;
}

export interface TerminalStreamResult {
  requestId?: string;
  /**
   * Claims the response relay once and returns its HTTP response.
   * @returns The response relay.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
  toResponse: () => Response;
  /**
   * Claims the SSE bytes once, without constructing a Response. Shares ownership with toResponse().
   * @returns The SSE byte stream.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
  toStream: () => ReadableStream<Uint8Array>;
}

type StatelessGenerationInput = AttributionInput & CorrelatedRequestInput;

export interface CompletionPromptInput extends StatelessGenerationInput {
  abortSignal?: AbortSignal;
  agentId: string;
  prompt: string;
  promptId?: never;
  schema?: never;
  variables?: never;
}

export interface CompletionPromptIdInput extends StatelessGenerationInput {
  abortSignal?: AbortSignal;
  agentId: string;
  prompt?: never;
  promptId: string;
  schema?: never;
  variables?: Record<string, string>;
}

export type CompletionInput = CompletionPromptInput | CompletionPromptIdInput;

export interface CompletionResult {
  requestId?: string;
  text: Promise<string>;
  textStream: AsyncIterable<string>;
  /**
   * Claims the response relay once and returns its HTTP response.
   * @returns The response relay.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
  toResponse: () => Response;
}

export interface ObjectPromptInput extends StatelessGenerationInput {
  abortSignal?: AbortSignal;
  agentId: string;
  prompt: string;
  promptId?: never;
  schema: Record<string, unknown>;
  variables?: never;
}

export interface ObjectPromptIdInput extends StatelessGenerationInput {
  abortSignal?: AbortSignal;
  agentId: string;
  prompt?: never;
  promptId: string;
  schema: Record<string, unknown>;
  variables?: Record<string, string>;
}

export type ObjectInput = ObjectPromptInput | ObjectPromptIdInput;

export interface ObjectResult {
  object: Promise<unknown>;
  partialObjectStream: AsyncIterable<unknown>;
  requestId?: string;
  /**
   * Claims the response relay once and returns its HTTP response.
   * @returns The response relay.
   * @throws BlazingAgentsError - If the response body has already been claimed.
   */
  toResponse: () => Response;
}

export interface ResourceRequestOptions {
  abortSignal?: AbortSignal;
}

export interface AgentClient {
  readonly skills: AgentSkillsResource;
}
