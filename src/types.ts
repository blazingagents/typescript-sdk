import type { UIMessage, UIMessageChunk } from "ai";
import type { ApiErrorCode } from "./contracts/api.ts";
import type {
  Agent,
  AgentsResponse,
  AgentVersion,
  AgentVersionsResponse,
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
  DecideToolApprovalBody,
  LatestSessionsListResponse,
  SessionMessagesResponse,
  SessionsListResponse,
  ToolApprovalDecisionResponse,
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
import type { UsageQuery, UsageResponse } from "./contracts/entities/usage.ts";
import type {
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  Workspace,
  WorkspacesListResponse,
} from "./contracts/entities/workspaces.ts";

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
  /**
   * The SDK never sends multipart bodies via the global `FormData`; the
   * skill upload path passes a `FormData` instance directly. This slot
   * exists only so the type carries the union cleanly.
   */
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
  /**
   * JSON body (object — serialized by the helper) or `undefined` for
   * GET/DELETE. Multipart uploads bypass this and pass `FormData` via
   * `extra.body`.
   */
  json?: unknown;
  // The HTTP method (default `GET`).
  method?: string;
  /**
   * Query params appended to the path. `undefined`/`null` values are
   * skipped. Values are scalar — stringified with `String()`. No `/v1`
   * endpoint accepts repeated keys, so array values are not supported.
   */
  query?: Record<string, string | number | boolean | null | undefined>;
  // Pass-through `signal` for abort/timeout.
  signal?: AbortSignal;
}

export interface HttpConfig {
  apiKey: string;
  baseUrl: string;
  clientRequestId?: string;
  fetch?: BlazingAgentsFetch;
  onResponse?: ((response: ResponseObservation) => void) | undefined;
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
  version?: number;
}

interface ExistingSessionInput {
  sessionId: string;
  trigger?: ChatTrigger;
  version?: never;
}

type ChatSessionInput = NewSessionInput | ExistingSessionInput;

interface ChatMessageContentInput
  extends AttributionInput,
    CorrelatedRequestInput {
  abortSignal?: AbortSignal;
  agentId: string;
  message: UIMessage;
  messageId?: string;
  promptId?: never;
  variables?: never;
}

interface ChatPromptContentInput
  extends AttributionInput,
    CorrelatedRequestInput {
  abortSignal?: AbortSignal;
  agentId: string;
  message?: never;
  messageId?: string;
  promptId: string;
  variables?: Record<string, string>;
}

export type ChatMessageInput = ChatMessageContentInput & ChatSessionInput;
export type ChatPromptInput = ChatPromptContentInput & ChatSessionInput;
export type ChatInput = ChatMessageInput | ChatPromptInput;

export interface ChatResult {
  requestId?: string;
  /**
   * Resolves to the session id of this chat — the server-minted `ss_` id
   * read from the `Location` header on the create path, or the passed
   * `sessionId` on resume. The tenant persists this id and reuses it to
   * resume.
   */
  sessionId: Promise<string>;
  toResponse: () => Response;
  /** Claims the SSE bytes once, without constructing a Response. Shares ownership with toResponse(). */
  toStream: () => ReadableStream<Uint8Array>;
}

export interface TerminalStreamResult {
  requestId?: string;
  toResponse: () => Response;
  /** Claims the SSE bytes once, without constructing a Response. Shares ownership with toResponse(). */
  toStream: () => ReadableStream<Uint8Array>;
}

interface StatelessGenerationInput
  extends AttributionInput,
    CorrelatedRequestInput {
  version?: number;
}

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
  toResponse: () => Response;
}

export interface ResourceRequestOptions {
  abortSignal?: AbortSignal;
}

export interface AgentsResource {
  /** Omitting `workspaceId` attaches a default Workspace with a lazy runtime. */
  create(input: CreateAgentBody & ResourceRequestOptions): Promise<Agent>;
  /** Deletes the Agent while preserving its attached Workspace. */
  delete(
    input: {
      agentId: string;
      includeArtifacts: boolean;
    } & ResourceRequestOptions
  ): Promise<void>;
  disable(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  enable(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  get(input: { agentId: string } & ResourceRequestOptions): Promise<Agent>;
  getVersion(
    input: { agentId: string; version: number } & ResourceRequestOptions
  ): Promise<AgentVersion>;
  list(input?: AgentsListOptions): Promise<AgentsResponse>;
  listMcpAttachments(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<McpAttachmentsResponse>;
  listVersions(
    input: { agentId: string } & AgentVersionsListOptions
  ): Promise<AgentVersionsResponse>;
  removeAvatar(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<Agent>;
  /** Copies an immutable Version into the Agent, creating a new latest Version. */
  restoreVersion(
    input: { agentId: string; version: number } & ResourceRequestOptions
  ): Promise<Agent>;
  /** A concrete `workspaceId` switches the Agent; detachment is unsupported. */
  update(
    input: UpdateAgentBody & { agentId: string } & ResourceRequestOptions
  ): Promise<Agent>;
  updateMcpAttachment(
    input: UpdateMcpAttachmentBody & {
      agentId: string;
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpAttachmentResponse>;
  uploadAvatar(
    input: { agentId: string; file: File } & ResourceRequestOptions
  ): Promise<Agent>;
}

export interface AgentClient {
  readonly skills: AgentSkillsResource;
}

export interface AgentsListOptions extends ResourceRequestOptions {
  userId?: string;
  workspaceId?: string;
}

export interface WorkspacesResource {
  create(
    input?: CreateWorkspaceBody & ResourceRequestOptions
  ): Promise<Workspace>;
  delete(
    input: { workspaceId: string } & ResourceRequestOptions
  ): Promise<"completed" | "pending">;
  get(
    input: { workspaceId: string } & ResourceRequestOptions
  ): Promise<Workspace>;
  list(input?: WorkspacesListOptions): Promise<WorkspacesListResponse>;
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

export interface AgentVersionsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
}

export interface ArtifactsListOptions extends ResourceRequestOptions {
  agentId?: string;
  cursor?: string;
  sessionId?: string;
}

export interface ArtifactsResource {
  createDownloadUrl(
    input: { artifactId: string } & ResourceRequestOptions
  ): Promise<ArtifactDownloadUrlResponse>;
  delete(input: { artifactId: string } & ResourceRequestOptions): Promise<void>;
  get(
    input: { artifactId: string } & ResourceRequestOptions
  ): Promise<ArtifactListItem>;
  list(input?: ArtifactsListOptions): Promise<ArtifactsListResponse>;
}

export interface MemoriesResource {
  create(
    input: CreateMemoryBody & { agentId: string } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
  delete(
    input: { agentId: string; memoryId: string } & ResourceRequestOptions
  ): Promise<void>;
  get(
    input: { agentId: string; memoryId: string } & ResourceRequestOptions
  ): Promise<MemoryResponse>;
  list(
    input: { agentId: string } & MemoriesListOptions
  ): Promise<MemoriesListResponse>;
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
  create(
    input: CreatePromptBody & ResourceRequestOptions
  ): Promise<PromptResponse>;
  delete(input: { promptId: string } & ResourceRequestOptions): Promise<void>;
  get(
    input: { promptId: string } & ResourceRequestOptions
  ): Promise<PromptResponse>;
  list(
    input?: { userId?: string; agentId?: string } & ResourceRequestOptions
  ): Promise<PromptsResponse>;
  update(
    input: UpdatePromptBody & { promptId: string } & ResourceRequestOptions
  ): Promise<PromptResponse>;
}

export interface ProvidersResource {
  create(
    input: CreateProviderBody & ResourceRequestOptions
  ): Promise<ProviderResponse>;
  delete(
    input: DeleteProviderOptions & {
      providerId: string;
    } & ResourceRequestOptions
  ): Promise<void>;
  get(
    input: { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderResponse>;
  getThinkingLevels(
    input: { providerId: string; model: string } & ResourceRequestOptions
  ): Promise<ThinkingLevelsResponse>;
  list(input?: ResourceRequestOptions): Promise<ProvidersResponse>;
  listModels(
    input: { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderModelsResponse>;
  update(
    input: UpdateProviderBody & { providerId: string } & ResourceRequestOptions
  ): Promise<ProviderResponse>;
}

export interface McpConnectionsResource {
  connect(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionOauthConnectResponse>;
  create(
    input: CreateMcpConnectionBody & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
  delete(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<void>;
  get(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionResponse>;
  list(input?: ResourceRequestOptions): Promise<McpConnectionsResponse>;
  reconnect(
    input: ReconnectMcpConnectionBody & {
      mcpConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<McpConnectionReconnectResult>;
  test(
    input: { mcpConnectionId: string } & ResourceRequestOptions
  ): Promise<McpConnectionTestResponse>;
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
  decideToolApproval(
    input: DecideToolApprovalBody & {
      agentId: string;
      sessionId: string;
      approvalId: string;
    } & ResourceRequestOptions
  ): Promise<ToolApprovalDecisionResponse>;
  delete(
    input: {
      agentId: string;
      sessionId: string;
      deleteArtifacts: boolean;
    } & ResourceRequestOptions
  ): Promise<void>;
  joinToolApprovalContinuation(
    input: {
      agentId: string;
      sessionId: string;
      continuationId: string;
    } & ResourceRequestOptions
  ): Promise<TerminalStreamResult>;
  list(
    input: { agentId: string } & SessionsListOptions
  ): Promise<SessionsListResponse>;
  /**
   * `GET /v1/sessions/latest` — each Agent's most recently updated Session
   * across the Tenant, one item per Agent, newest first. `userId` narrows
   * the candidate Sessions to one end user's before picking the latest.
   */
  listLatest(
    input?: LatestSessionsListOptions
  ): Promise<LatestSessionsListResponse>;
  messages(
    input: { agentId: string; sessionId: string } & SessionMessagesOptions
  ): Promise<SessionMessagesResponse>;
  toolApprovals(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<ToolApprovalsResponse>;
}

export interface AgentSkillsResource {
  copy(
    input: {
      skillId: string;
      to: { agentIds: string[] };
    } & ResourceRequestOptions
  ): Promise<SkillCopyResults>;
  create(input: CreateSkillBody & ResourceRequestOptions): Promise<SkillDetail>;
  delete(input: { skillId: string } & ResourceRequestOptions): Promise<void>;
  deleteFile(
    input: { path: string; skillId: string } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  get(
    input: { skillId: string } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  getFile(
    input: { path: string; skillId: string } & ResourceRequestOptions
  ): Promise<Uint8Array>;
  list(input?: SkillsListOptions): Promise<SkillsListResponse>;
  putFile(
    input: {
      content: Blob | string | Uint8Array;
      path: string;
      skillId: string;
    } & ResourceRequestOptions
  ): Promise<SkillDetail>;
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
  cancelRun(
    input: { taskId: string; runId: string } & ResourceRequestOptions
  ): Promise<void>;
  create(
    input: CreateTaskBody & ResourceRequestOptions
  ): Promise<CreateTaskResponse>;
  createRun(
    input: CreateTaskRunBody & { taskId: string } & ResourceRequestOptions
  ): Promise<CreateTaskRunResponse>;
  delete(input: { taskId: string } & ResourceRequestOptions): Promise<void>;
  get(
    input: { taskId: string } & ResourceRequestOptions
  ): Promise<TaskResponse>;
  getRun(
    input: { taskId: string; runId: string } & ResourceRequestOptions
  ): Promise<TaskRunResponse>;
  list(input?: TasksListOptions): Promise<TasksListResponse>;
  listRuns(
    input: { taskId: string } & TaskRunsListOptions
  ): Promise<TaskRunsListResponse>;
  runMessages(
    input: { taskId: string; runId: string } & TaskRunMessagesOptions
  ): Promise<TaskRunMessagesResponse>;
  update(
    input: UpdateTaskBody & { taskId: string } & ResourceRequestOptions
  ): Promise<TaskResponse>;
}

export interface TenantResource {
  get(input?: ResourceRequestOptions): Promise<TenantSettingsResponse>;
  patch(
    input: UpdateTenantSettingsBody & ResourceRequestOptions
  ): Promise<TenantSettingsResponse>;
}

export interface UsageResource {
  get(
    input?: Partial<UsageQuery> & ResourceRequestOptions
  ): Promise<UsageResponse>;
  getForAgent(
    input: Partial<UsageQuery> & { agentId: string } & ResourceRequestOptions
  ): Promise<UsageResponse>;
}
