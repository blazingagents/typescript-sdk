import type { UIMessage, UIMessageChunk } from "ai";
import type { ApiErrorCode } from "./contracts/api.ts";
import type {
  Agent,
  AgentsResponse,
  CreateAgentBody,
  UpdateAgentBody,
} from "./contracts/entities/agents.ts";
import type {
  ArtifactDownloadUrlResponse,
  ArtifactListItem,
  ArtifactsListResponse,
} from "./contracts/entities/artifacts.ts";
import type { BlazingAgentsChatMessageMetadata } from "./contracts/entities/chat.ts";
import type {
  ChatConnection,
  ChatConnectionsResponse,
  ChatDeliveriesResponse,
  ChatDeliveryListStatus,
  CreateChatConnectionBody,
  RotateChatConnectionBody,
  UpdateChatConnectionBody,
} from "./contracts/entities/chat-connections.ts";
import type {
  CreateMcpConnectionBody,
  McpAttachmentResponse,
  McpAttachmentsResponse,
  McpConnectionOauthConnectResponse,
  McpConnectionReconnectResult,
  McpConnectionResponse,
  McpConnectionsResponse,
  McpConnectionTestResponse,
  ReconnectMcpConnectionBody,
  UpdateMcpAttachmentBody,
  UpdateMcpConnectionBody,
} from "./contracts/entities/mcp-connections.ts";
import type {
  CreateMemoryBody,
  MemoriesListResponse,
  MemoryResponse,
  UpdateMemoryBody,
} from "./contracts/entities/memories.ts";
import type {
  CreateMerchantConnectionBody,
  MerchantBindingResponse,
  MerchantBindingsResponse,
  MerchantConnectionResponse,
  MerchantUsageEventResponse,
  MerchantUsageEventStatus,
  MerchantUsageEventsResponse,
  MerchantUsageSummaryResponse,
  UpdateMerchantConnectionBody,
  UpsertMerchantBindingBody,
} from "./contracts/entities/merchant.ts";
import type {
  CreatePromptBody,
  PromptResponse,
  PromptsResponse,
  UpdatePromptBody,
} from "./contracts/entities/prompts.ts";
import type {
  CreateProviderBody,
  DeleteProviderOptions,
  ProviderModelsResponse,
  ProviderResponse,
  ProvidersResponse,
  ThinkingLevelsResponse,
  UpdateProviderBody,
} from "./contracts/entities/providers.ts";
import type {
  SessionInputResponse,
  SessionInputsQuery,
  SessionInputsResponse,
  StopSessionBody,
  StopSessionResponse,
  SubmitSessionInputBody,
} from "./contracts/entities/session-inputs.ts";
import type {
  LatestSessionsListResponse,
  SessionMessagesResponse,
  SessionResponse,
  SessionsListResponse,
  ToolApprovalDecision,
  ToolApprovalsResponse,
} from "./contracts/entities/sessions.ts";
import type {
  CreateSkillBody,
  SkillArchiveType,
  SkillCopyResults,
  SkillDetail,
  SkillsListResponse,
} from "./contracts/entities/skills.ts";
import type {
  CreateTaskBody,
  CreateTaskResponse,
  CreateTaskRunBody,
  CreateTaskRunResponse,
  TaskResponse,
  TaskRunMessagesResponse,
  TaskRunResponse,
  TaskRunsListResponse,
  TasksListResponse,
  UpdateTaskBody,
} from "./contracts/entities/tasks.ts";
import type {
  TenantSettingsResponse,
  UpdateTenantSettingsBody,
} from "./contracts/entities/tenants.ts";
import type {
  SessionUsageQuery,
  SessionUsageResponse,
  UsageOverviewQuery,
  UsageOverviewResponse,
  UsageQuery,
  UsageResponse,
} from "./contracts/entities/usage.ts";
import type {
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  Workspace,
  WorkspacesListResponse,
} from "./contracts/entities/workspaces.ts";
import type { ChatFunctions } from "./functions.ts";

export type KnownBlazingAgentsErrorCode =
  | ApiErrorCode
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
  readonly agents: AgentsResource;
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
  readonly usage: Pick<UsageResource, "get" | "sessions">;
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

export type BlazingAgentsUIMessage =
  UIMessage<BlazingAgentsChatMessageMetadata>;
export type BlazingAgentsUIMessageChunk =
  UIMessageChunk<BlazingAgentsChatMessageMetadata>;

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

export interface AgentsResource {
  /**
   * Creates the Agent. Omitting `workspaceId` creates a Core Workspace by default. `workspaceTier` selects its immutable tier and conflicts with `workspaceId`.
   * @param input - creation fields; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(input: CreateAgentBody & ResourceRequestOptions): Promise<Agent>;
  /**
   * Deletes the Agent while preserving its attached Workspace.
   * @param input - `agentId`; optional abortSignal; includeArtifacts controls Artifact deletion.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: {
      agentId: string;
      includeArtifacts: boolean;
    } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Disables the Agent.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  disable(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  /**
   * Enables the Agent.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  enable(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  /**
   * Retrieves the Agent.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  /**
   * Lists available Agent records.
   * @param input - filters and pagination options.
   * @returns Matching Agents. This response has no pagination cursor.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: AgentsListOptions): Promise<AgentsResponse>;
  /**
   * Lists the Agent MCP attachments.
   * @param input - `agentId`; optional abortSignal.
   * @returns The mcp attachments response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listMcpAttachments(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<McpAttachmentsResponse>;
  /**
   * Removes the Agent avatar.
   * @param input - `agentId`; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  removeAvatar(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<Agent>;
  /**
   * Updates the Agent. A concrete `workspaceId` switches the Agent; detachment is unsupported.
   * @param input - `agentId`; fields to change; optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateAgentBody & { agentId: string } & ResourceRequestOptions
  ): Promise<Agent>;
  /**
   * Updates one Agent MCP attachment.
   * @param input - `agentId`, `mcpConnectionId`; fields to change; optional abortSignal.
   * @returns The mcp attachment response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  updateMcpAttachment(
    input: UpdateMcpAttachmentBody & {
      agentId: string;
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpAttachmentResponse>;
  /**
   * Uploads an Agent avatar as multipart form data.
   * @param input - Target `agentId`, image `file`, and optional abortSignal.
   * @returns The agent.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  uploadAvatar(
    input: { agentId: string; file: File } & ResourceRequestOptions
  ): Promise<Agent>;
}

export interface AgentClient {
  readonly skills: AgentSkillsResource;
}

export interface AgentsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
  workspaceId?: string;
}

export interface WorkspacesResource {
  /**
   * Creates the Workspace.
   * @param input - creation fields; optional abortSignal.
   * @returns The workspace.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input?: CreateWorkspaceBody & ResourceRequestOptions
  ): Promise<Workspace>;
  /**
   * Deletes the Workspace.
   * @param input - `workspaceId`; optional abortSignal.
   * @returns "pending" while deletion is underway, otherwise "completed".
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { workspaceId: string } & ResourceRequestOptions
  ): Promise<"completed" | "pending">;
  /**
   * Retrieves the Workspace.
   * @param input - `workspaceId`; optional abortSignal.
   * @returns The workspace.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { workspaceId: string } & ResourceRequestOptions
  ): Promise<Workspace>;
  /**
   * Lists one page of Workspace records.
   * @param input - filters and pagination options.
   * @returns The workspaces list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: WorkspacesListOptions): Promise<WorkspacesListResponse>;
  /**
   * Updates the Workspace.
   * @param input - `workspaceId`; fields to change; optional abortSignal.
   * @returns The workspace.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateWorkspaceBody & {
      workspaceId: string;
    } & ResourceRequestOptions
  ): Promise<Workspace>;
}

export interface WorkspacesListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface ArtifactsListOptions extends ResourceRequestOptions {
  agentId?: string;
  cursor?: string;
  sessionId?: string;
}

export interface ArtifactsResource {
  /**
   * Creates a temporary Artifact download URL.
   * @param input - `artifactId`; optional abortSignal.
   * @returns The artifact download url response.
   */
  createDownloadUrl(
    input: { artifactId: string } & ResourceRequestOptions
  ): Promise<ArtifactDownloadUrlResponse>;
  /**
   * Deletes the Artifact.
   * @param input - `artifactId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { artifactId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Retrieves the Artifact.
   * @param input - `artifactId`; optional abortSignal.
   * @returns The artifact list item.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { artifactId: string } & ResourceRequestOptions
  ): Promise<ArtifactListItem>;
  /**
   * Lists one page of Artifact records.
   * @param input - filters and pagination options.
   * @returns The artifacts list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ArtifactsListOptions): Promise<ArtifactsListResponse>;
}

export interface MemoriesResource {
  /**
   * Creates the Memory.
   * @param input - `agentId`; creation fields; optional abortSignal.
   * @returns The memory response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateMemoryBody & { agentId: string } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
  /**
   * Deletes the Memory.
   * @param input - `agentId`, `memoryId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { agentId: string; memoryId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retrieves the Memory.
   * @param input - `agentId`, `memoryId`; optional abortSignal.
   * @returns The memory response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { agentId: string; memoryId: string } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
  /**
   * Lists one page of Memory records.
   * @param input - `agentId`; filters and pagination options.
   * @returns The memories list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input: { agentId: string } & MemoriesListOptions
  ): Promise<MemoriesListResponse>;
  /**
   * Updates the Memory.
   * @param input - `agentId`, `memoryId`; fields to change; optional abortSignal.
   * @returns The memory response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateMemoryBody & {
      agentId: string;
      memoryId: string;
    } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
}

export interface MemoriesListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  search?: string;
  userId?: string;
}

export interface PromptsResource {
  /**
   * Creates the Prompt.
   * @param input - creation fields; optional abortSignal.
   * @returns The prompt response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreatePromptBody & ResourceRequestOptions
  ): Promise<PromptResponse>;
  /**
   * Deletes the Prompt.
   * @param input - `promptId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { promptId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Retrieves the Prompt.
   * @param input - `promptId`; optional abortSignal.
   * @returns The prompt response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { promptId: string } & ResourceRequestOptions
  ): Promise<PromptResponse>;
  /**
   * Lists one page of Prompt records.
   * @param input - `userId`, `agentId`; filters and pagination options; optional abortSignal.
   * @returns The prompts response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input?: {
      userId?: string;
      agentId?: string;
      cursor?: string;
      limit?: number;
    } & ResourceRequestOptions
  ): Promise<PromptsResponse>;
  /**
   * Updates the Prompt.
   * @param input - `promptId`; fields to change; optional abortSignal.
   * @returns The prompt response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdatePromptBody & { promptId: string } & ResourceRequestOptions
  ): Promise<PromptResponse>;
}

export interface ProvidersResource {
  /**
   * Creates the Provider.
   * @param input - creation fields; optional abortSignal.
   * @returns The provider response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateProviderBody & ResourceRequestOptions
  ): Promise<ProviderResponse>;
  /**
   * Deletes the Provider.
   * @param input - `providerId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: DeleteProviderOptions & {
      providerId: string;
    } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retrieves the Provider.
   * @param input - `providerId`; optional abortSignal.
   * @returns The provider response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderResponse>;
  /**
   * Retrieves supported thinking levels for a Provider model.
   * @param input - `providerId`, provider-specific `model` name, and optional abortSignal.
   * @returns The thinking levels response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getThinkingLevels(
    input: { providerId: string; model: string } & ResourceRequestOptions
  ): Promise<ThinkingLevelsResponse>;
  /**
   * Lists available Provider records.
   * @param input - optional abortSignal.
   * @returns The providers response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ResourceRequestOptions): Promise<ProvidersResponse>;
  /**
   * Lists models exposed by the Provider.
   * @param input - `providerId`; optional abortSignal.
   * @returns The provider models response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listModels(
    input: { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderModelsResponse>;
  /**
   * Updates the Provider.
   * @param input - `providerId`; fields to change; optional abortSignal.
   * @returns The provider response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateProviderBody & { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderResponse>;
}

export interface McpConnectionsResource {
  /**
   * Starts OAuth authorization for the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns The mcp connection oauth connect response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  connect(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionOauthConnectResponse>;
  /**
   * Creates the MCP Connection.
   * @param input - creation fields; optional abortSignal.
   * @returns The mcp connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateMcpConnectionBody & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
  /**
   * Deletes the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retrieves the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns The mcp connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
  /**
   * Lists available MCP Connection records.
   * @param input - optional abortSignal.
   * @returns The mcp connections response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ResourceRequestOptions): Promise<McpConnectionsResponse>;
  /**
   * Reconnects the MCP Connection.
   * @param input - `mcpConnectionId`; fields to change; optional abortSignal.
   * @returns The mcp connection reconnect result.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  reconnect(
    input: ReconnectMcpConnectionBody & {
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpConnectionReconnectResult>;
  /**
   * Tests the MCP Connection.
   * @param input - `mcpConnectionId`; optional abortSignal.
   * @returns The mcp connection test response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  test(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionTestResponse>;
  /**
   * Updates the MCP Connection.
   * @param input - `mcpConnectionId`; fields to change; optional abortSignal.
   * @returns The mcp connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateMcpConnectionBody & {
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
}

export interface SessionsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface LatestSessionsListOptions extends ResourceRequestOptions {
  byAgent?: boolean;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface SessionMessagesOptions extends ResourceRequestOptions {
  after?: string;
  cursor?: string;
  limit?: number;
}

export interface SessionsResource {
  /**
   * Deletes the Session.
   * @param input - `agentId`, `sessionId`; optional abortSignal; deleteArtifacts controls Artifact deletion.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: {
      agentId: string;
      sessionId: string;
      deleteArtifacts: boolean;
    } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Retry an uncertain acknowledgement with the same explicit idempotencyKey.
   * @param input - `agentId`, `sessionId`, `messageId`; optional abortSignal.
   * @returns The session response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  fork(
    input: {
      agentId: string;
      sessionId: string;
      messageId: string;
      idempotencyKey: string;
    } & ResourceRequestOptions
  ): Promise<SessionResponse>;
  /**
   * Retrieves the Session.
   * @param input - `agentId`, `sessionId`; optional abortSignal.
   * @returns The session response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<SessionResponse>;
  /**
   * Poll from the first page for state changes; cursor only paginates receipts.
   * @param input - `agentId`, `sessionId`; query filters; optional abortSignal.
   * @returns The session inputs response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  inputs(
    input: { agentId: string; sessionId: string } & SessionInputsQuery &
      ResourceRequestOptions
  ): Promise<SessionInputsResponse>;
  /**
   * Lists one page of Session records.
   * @param input - `agentId`; filters and pagination options.
   * @returns The sessions list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input: { agentId: string } & SessionsListOptions
  ): Promise<SessionsListResponse>;
  /**
   * `GET /v1/sessions/latest` — the Tenant's most recently updated Sessions,
   * newest first. Set `byAgent` to return at most one Session per Agent.
   * `userId` narrows the candidate Sessions to one end user's.
   * @param input - filters and pagination options.
   * @returns The latest sessions list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listLatest(
    input?: LatestSessionsListOptions
  ): Promise<LatestSessionsListResponse>;
  /**
   * Lists one page of Session messages.
   * @param input - `agentId`, `sessionId`.
   * @returns The session messages response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  messages(
    input: { agentId: string; sessionId: string } & SessionMessagesOptions
  ): Promise<SessionMessagesResponse>;
  /**
   * Records cancellation for the named Turn without waiting for settlement.
   * @param input - `agentId`, `sessionId`; fields to change; optional abortSignal.
   * @returns The stop session response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  stop(
    input: { agentId: string; sessionId: string } & StopSessionBody &
      ResourceRequestOptions
  ): Promise<StopSessionResponse>;
  /**
   * Retry an uncertain acknowledgement with the same requestId and payload.
   * @param input - `agentId`, `sessionId`; fields to change; optional abortSignal.
   * @returns The session input response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  submitInput(
    input: Omit<SubmitSessionInputBody, "message"> & {
      agentId: string;
      sessionId: string;
      message: UIMessage;
    } & ResourceRequestOptions
  ): Promise<SessionInputResponse>;
  /**
   * Retrieves the pending Tool approval round.
   * @param input - `agentId`, `sessionId`; optional abortSignal.
   * @returns The tool approvals response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  toolApprovals(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<ToolApprovalsResponse>;
}

export interface AgentSkillsResource {
  /**
   * Copies the Skill to the selected Agents.
   * @param input - Source `skillId`, destination `to.agentIds`, and optional abortSignal.
   * @returns The skill copy results.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  copy(
    input: {
      skillId: string;
      to: { agentIds: string[] };
    } & ResourceRequestOptions
  ): Promise<SkillCopyResults>;
  /**
   * Creates the Skill.
   * @param input - creation fields; optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(input: CreateSkillBody & ResourceRequestOptions): Promise<SkillDetail>;
  /**
   * Deletes the Skill.
   * @param input - `skillId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { skillId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Deletes a Skill file.
   * @param input - `skillId`, relative file `path`, and optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  deleteFile(
    input: { path: string; skillId: string } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  /**
   * Retrieves the Skill.
   * @param input - `skillId`; optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { skillId: string } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  /**
   * Reads Skill file bytes.
   * @param input - `skillId`, relative file `path`, and optional abortSignal.
   * @returns The requested file bytes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getFile(
    input: { path: string; skillId: string } & ResourceRequestOptions
  ): Promise<Uint8Array>;
  /**
   * Lists one page of Skill records.
   * @param input - filters and pagination options.
   * @returns The skills list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: SkillsListOptions): Promise<SkillsListResponse>;
  /**
   * Replaces a Skill file with the supplied content.
   * @param input - `skillId`, relative `path`, replacement `content`, and optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  putFile(
    input: {
      content: Blob | string | Uint8Array;
      path: string;
      skillId: string;
    } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  /**
   * Uploads a Skill archive as multipart form data.
   * @param input - Archive bytes in `source.file`, archive format in `source.type`, and optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  upload(
    input: {
      source: { file: Blob | Uint8Array; type: SkillArchiveType };
    } & ResourceRequestOptions
  ): Promise<SkillDetail>;
}

export interface SkillsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
}

export interface TasksListOptions extends ResourceRequestOptions {
  agentId?: string;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface TaskRunsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
}

export interface TaskRunMessagesOptions extends ResourceRequestOptions {
  after?: string;
  cursor?: string;
  limit?: number;
}

export interface TasksResource {
  /**
   * Requests cancellation of a Task run.
   * @param input - `taskId`, `runId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  cancelRun(
    input: { taskId: string; runId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Creates the Task.
   * @param input - creation fields; optional abortSignal.
   * @returns The create task response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateTaskBody & ResourceRequestOptions
  ): Promise<CreateTaskResponse>;
  /**
   * Creates a Task run.
   * @param input - `taskId`; creation fields; optional abortSignal.
   * @returns The create task run response.
   */
  createRun(
    input: CreateTaskRunBody & { taskId: string } & ResourceRequestOptions
  ): Promise<CreateTaskRunResponse>;
  /**
   * Deletes the Task.
   * @param input - `taskId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { taskId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Retrieves the Task.
   * @param input - `taskId`; optional abortSignal.
   * @returns The task response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { taskId: string } & ResourceRequestOptions
  ): Promise<TaskResponse>;
  /**
   * Retrieves a Task run.
   * @param input - `taskId`, `runId`; optional abortSignal.
   * @returns The task run response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getRun(
    input: { taskId: string; runId: string } & ResourceRequestOptions
  ): Promise<TaskRunResponse>;
  /**
   * Lists one page of Task records.
   * @param input - filters and pagination options.
   * @returns The tasks list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: TasksListOptions): Promise<TasksListResponse>;
  /**
   * Lists one page of Task runs.
   * @param input - `taskId`; filters and pagination options.
   * @returns The task runs list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listRuns(
    input: { taskId: string } & TaskRunsListOptions
  ): Promise<TaskRunsListResponse>;
  /**
   * Lists one page of Task run messages.
   * @param input - `taskId`, `runId`.
   * @returns The task run messages response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  runMessages(
    input: { taskId: string; runId: string } & TaskRunMessagesOptions
  ): Promise<TaskRunMessagesResponse>;
  /**
   * Updates the Task.
   * @param input - `taskId`; fields to change; optional abortSignal.
   * @returns The task response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateTaskBody & { taskId: string } & ResourceRequestOptions
  ): Promise<TaskResponse>;
}

export interface TenantResource {
  /**
   * Retrieves Tenant settings.
   * @param input - optional abortSignal.
   * @returns The tenant settings response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(input?: ResourceRequestOptions): Promise<TenantSettingsResponse>;
  /**
   * Updates Tenant settings.
   * @param input - fields to change; optional abortSignal.
   * @returns The tenant settings response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  patch(
    input: UpdateTenantSettingsBody & ResourceRequestOptions
  ): Promise<TenantSettingsResponse>;
}

export interface UsageResource {
  /**
   * Retrieves usage totals.
   * @param input - query filters; optional abortSignal.
   * @returns The usage response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input?: Partial<UsageQuery> & ResourceRequestOptions
  ): Promise<UsageResponse>;
  /**
   * Retrieves usage for one Agent.
   * @param input - `agentId`; query filters; optional abortSignal.
   * @returns The usage response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getForAgent(
    input: Partial<UsageQuery> & { agentId: string } & ResourceRequestOptions
  ): Promise<UsageResponse>;
  /**
   * Returns totals, daily usage, and bounded Agent, user, and model rankings.
   * @param input - query filters; optional abortSignal.
   * @returns The usage overview response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  overview(
    input?: Partial<UsageOverviewQuery> & ResourceRequestOptions
  ): Promise<UsageOverviewResponse>;
  /**
   * Retrieves usage grouped by Session.
   * @param input - query filters; optional abortSignal.
   * @returns The session usage response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  sessions(
    input: SessionUsageQuery & ResourceRequestOptions
  ): Promise<SessionUsageResponse>;
}

/**
 * `client.merchantConnection` — the tenant's own Polar/Dodo merchant
 * connection (ADR-0048). `credential` is write-only: responses expose only
 * `keyFragment`.
 */
export interface MerchantConnectionResource {
  /**
   * Creates the merchant connection.
   * @param input - creation fields; optional abortSignal.
   * @returns The merchant connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateMerchantConnectionBody & ResourceRequestOptions
  ): Promise<MerchantConnectionResponse>;
  /**
   * Retrieves the merchant connection.
   * @param input - optional abortSignal.
   * @returns The merchant connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(input?: ResourceRequestOptions): Promise<MerchantConnectionResponse>;
  /**
   * Retires the merchant connection and stops deliveries.
   * @param input - optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  retire(input?: ResourceRequestOptions): Promise<void>;
  /**
   * Updates the merchant connection.
   * @param input - fields to change; optional abortSignal.
   * @returns The merchant connection response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateMerchantConnectionBody & ResourceRequestOptions
  ): Promise<MerchantConnectionResponse>;
}

export interface MerchantBindingsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

/**
 * `client.merchantBindings` — end-user → provider customer bindings behind
 * `/v1/merchant-connection/bindings`. `put` validates the customer against
 * the provider.
 */
export interface MerchantBindingsResource {
  /**
   * Deletes the end-user merchant binding.
   * @param input - `userId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { userId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Lists one page of end-user merchant binding records.
   * @param input - filters and pagination options.
   * @returns The merchant bindings response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: MerchantBindingsListOptions): Promise<MerchantBindingsResponse>;
  /**
   * Validates and saves the end-user merchant binding.
   * @param input - `userId`; fields to change; optional abortSignal.
   * @returns The merchant binding response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  put(
    input: UpsertMerchantBindingBody & {
      userId: string;
    } & ResourceRequestOptions
  ): Promise<MerchantBindingResponse>;
}

export interface MerchantUsageEventsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  status?: MerchantUsageEventStatus;
}

/**
 * `client.merchantUsageEvents` — the immutable delivery ledger behind
 * `/v1/merchant-usage-events`. `retry`, `release`, and `discard` are the
 * operator actions on unresolved events.
 */
export interface MerchantUsageEventsResource {
  /**
   * Discards the merchant usage event.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  discard(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Retrieves the merchant usage event.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Lists one page of merchant usage event records.
   * @param input - filters and pagination options.
   * @returns The merchant usage events response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input?: MerchantUsageEventsListOptions
  ): Promise<MerchantUsageEventsResponse>;
  /**
   * Releases the merchant usage event.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  release(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Retries delivery of the merchant usage event.
   * @param input - `eventId`; optional abortSignal.
   * @returns The merchant usage event response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  retry(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  /**
   * Retrieves merchant usage delivery totals for the selected day range.
   * @param input - Lookback window in `days` and optional abortSignal.
   * @returns The merchant usage summary response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  summary(
    input?: { days?: number } & ResourceRequestOptions
  ): Promise<MerchantUsageSummaryResponse>;
}

export interface ChatConnectionsResource {
  /**
   * Checks the Chat Connection health.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  checkHealth(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Creates the Chat Connection.
   * @param input - creation fields; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateChatConnectionBody & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Deletes the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Disables the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  disable(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Enables the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  enable(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Retrieves the Chat Connection.
   * @param input - `chatConnectionId`; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Lists available Chat Connection records.
   * @param input - optional abortSignal.
   * @returns The chat connections response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ResourceRequestOptions): Promise<ChatConnectionsResponse>;
  /**
   * Replaces the Chat Connection credentials.
   * @param input - `chatConnectionId`; fields to change; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  rotateCredentials(
    input: RotateChatConnectionBody & {
      chatConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  /**
   * Updates the Chat Connection.
   * @param input - `chatConnectionId`; fields to change; optional abortSignal.
   * @returns The chat connection.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateChatConnectionBody & {
      chatConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<ChatConnection>;
}

export interface ChatDeliveriesListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
  /** ISO 8601 date-time; inclusive lower bound on `createdAt`. */
  since?: string;
  /** `failed` and/or `ambiguous`; omitted means both. */
  status?: readonly ChatDeliveryListStatus[];
}

/**
 * `client.chatDeliveries` — the Tenant's deliveries across all Chat
 * Connections behind `GET /v1/chat-deliveries`, newest first.
 */
export interface ChatDeliveriesResource {
  /**
   * Lists one page of Chat delivery records.
   * @param input - filters and pagination options.
   * @returns The chat deliveries response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ChatDeliveriesListOptions): Promise<ChatDeliveriesResponse>;
}
