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
  UpdateProviderBody,
} from "./contracts/entities/providers.ts";
import type {
  DecideToolApprovalBody,
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
  agentId: string;
  message: UIMessage;
  messageId?: string;
  promptId?: never;
  signal?: AbortSignal;
  variables?: never;
}

interface ChatPromptContentInput
  extends AttributionInput,
    CorrelatedRequestInput {
  agentId: string;
  message?: never;
  messageId?: string;
  promptId: string;
  signal?: AbortSignal;
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
}

export interface TerminalStreamResult {
  requestId?: string;
  toResponse: () => Response;
}

interface StatelessGenerationInput
  extends AttributionInput,
    CorrelatedRequestInput {
  version?: number;
}

export interface CompletionPromptInput extends StatelessGenerationInput {
  agentId: string;
  prompt: string;
  promptId?: never;
  schema?: never;
  signal?: AbortSignal;
  variables?: never;
}

export interface CompletionPromptIdInput extends StatelessGenerationInput {
  agentId: string;
  prompt?: never;
  promptId: string;
  schema?: never;
  signal?: AbortSignal;
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
  agentId: string;
  prompt: string;
  promptId?: never;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
  variables?: never;
}

export interface ObjectPromptIdInput extends StatelessGenerationInput {
  agentId: string;
  prompt?: never;
  promptId: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
  variables?: Record<string, string>;
}

export type ObjectInput = ObjectPromptInput | ObjectPromptIdInput;

export interface ObjectResult {
  object: Promise<unknown>;
  partialObjectStream: AsyncIterable<unknown>;
  requestId?: string;
  toResponse: () => Response;
}

export interface AgentsResource {
  /** Omitting `workspaceId` attaches a default Workspace with a lazy runtime. */
  create(body: CreateAgentBody): Promise<Agent>;
  /** Deletes the Agent while preserving its attached Workspace. */
  delete(agentId: string, includeArtifacts: boolean): Promise<void>;
  disable(agentId: string): Promise<Agent>;
  enable(agentId: string): Promise<Agent>;
  get(agentId: string): Promise<Agent>;
  getVersion(agentId: string, version: number): Promise<AgentVersion>;
  list(options?: AgentsListOptions): Promise<AgentsResponse>;
  listMcpAttachments(agentId: string): Promise<McpAttachmentsResponse>;
  listVersions(
    agentId: string,
    options?: AgentVersionsListOptions
  ): Promise<AgentVersionsResponse>;
  removeAvatar(agentId: string): Promise<Agent>;
  /**
   * Copies an immutable Version's configuration into the Agent through the
   * ordinary update path, creating a new latest Version without rewriting history.
   */
  restoreVersion(agentId: string, version: number): Promise<Agent>;
  /** A concrete `workspaceId` switches the Agent; detachment is unsupported. */
  update(agentId: string, body: UpdateAgentBody): Promise<Agent>;
  updateMcpAttachment(
    agentId: string,
    mcpConnectionId: string,
    body: UpdateMcpAttachmentBody
  ): Promise<McpAttachmentResponse>;
  uploadAvatar(agentId: string, file: File): Promise<Agent>;
}

export interface AgentClient {
  readonly skills: AgentSkillsResource;
}

export interface AgentsListOptions {
  userId?: string;
  workspaceId?: string;
}

export interface WorkspacesResource {
  create(body?: CreateWorkspaceBody): Promise<Workspace>;
  delete(input: { workspaceId: string }): Promise<"completed" | "pending">;
  get(input: { workspaceId: string }): Promise<Workspace>;
  list(options?: WorkspacesListOptions): Promise<WorkspacesListResponse>;
  update(
    input: UpdateWorkspaceBody & { workspaceId: string }
  ): Promise<Workspace>;
}

export interface WorkspacesListOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface AgentVersionsListOptions {
  cursor?: string;
  limit?: number;
}

export interface ArtifactsListOptions {
  agentId?: string;
  cursor?: string;
  sessionId?: string;
}

export interface ArtifactsResource {
  createDownloadUrl(artifactId: string): Promise<ArtifactDownloadUrlResponse>;
  delete(artifactId: string): Promise<void>;
  get(artifactId: string): Promise<ArtifactListItem>;
  list(options?: ArtifactsListOptions): Promise<ArtifactsListResponse>;
}

export interface MemoriesResource {
  create(agentId: string, body: CreateMemoryBody): Promise<MemoryResponse>;
  delete(agentId: string, memoryId: string): Promise<void>;
  get(agentId: string, memoryId: string): Promise<MemoryResponse>;
  list(
    agentId: string,
    options?: MemoriesListOptions
  ): Promise<MemoriesListResponse>;
  update(
    agentId: string,
    memoryId: string,
    body: UpdateMemoryBody
  ): Promise<MemoryResponse>;
}

export interface MemoriesListOptions {
  cursor?: string;
  limit?: number;
  search?: string;
  userId?: string;
}

export interface PromptsResource {
  create(body: CreatePromptBody): Promise<PromptResponse>;
  delete(promptId: string): Promise<void>;
  get(promptId: string): Promise<PromptResponse>;
  list(userId?: string): Promise<PromptsResponse>;
  update(promptId: string, body: UpdatePromptBody): Promise<PromptResponse>;
}

export interface ProvidersResource {
  create(body: CreateProviderBody): Promise<ProviderResponse>;
  delete(id: string, options?: DeleteProviderOptions): Promise<void>;
  get(id: string): Promise<ProviderResponse>;
  list(): Promise<ProvidersResponse>;
  listModels(id: string): Promise<ProviderModelsResponse>;
  update(id: string, body: UpdateProviderBody): Promise<ProviderResponse>;
}

export interface McpConnectionsResource {
  connect(id: string): Promise<McpConnectionOauthConnectResponse>;
  create(body: CreateMcpConnectionBody): Promise<McpConnectionResponse>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<McpConnectionResponse>;
  list(): Promise<McpConnectionsResponse>;
  reconnect(
    id: string,
    body: ReconnectMcpConnectionBody
  ): Promise<McpConnectionReconnectResult>;
  test(id: string): Promise<McpConnectionTestResponse>;
  update(
    id: string,
    body: UpdateMcpConnectionBody
  ): Promise<McpConnectionResponse>;
}

export interface SessionsListOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface SessionMessagesOptions {
  after?: string;
  cursor?: string;
  limit?: number;
}

export interface SessionsResource {
  decideToolApproval(
    agentId: string,
    sessionId: string,
    approvalId: string,
    decision: DecideToolApprovalBody,
    options?: { signal?: AbortSignal }
  ): Promise<ToolApprovalDecisionResponse>;
  delete(
    agentId: string,
    sessionId: string,
    deleteArtifacts: boolean
  ): Promise<void>;
  joinToolApprovalContinuation(
    agentId: string,
    sessionId: string,
    continuationId: string,
    options?: { signal?: AbortSignal }
  ): Promise<TerminalStreamResult>;
  list(
    agentId: string,
    options?: SessionsListOptions
  ): Promise<SessionsListResponse>;
  messages(
    agentId: string,
    sessionId: string,
    options?: SessionMessagesOptions
  ): Promise<SessionMessagesResponse>;
  toolApprovals(
    agentId: string,
    sessionId: string
  ): Promise<ToolApprovalsResponse>;
}

export interface AgentSkillsResource {
  copy(input: {
    skillId: string;
    to: { agentIds: string[] };
  }): Promise<SkillCopyResults>;
  create(input: CreateSkillBody): Promise<SkillDetail>;
  delete(input: { skillId: string }): Promise<void>;
  deleteFile(input: { path: string; skillId: string }): Promise<SkillDetail>;
  get(input: { skillId: string }): Promise<SkillDetail>;
  getFile(input: { path: string; skillId: string }): Promise<Uint8Array>;
  list(options?: SkillsListOptions): Promise<SkillsListResponse>;
  putFile(input: {
    content: Blob | string | Uint8Array;
    path: string;
    skillId: string;
  }): Promise<SkillDetail>;
  upload(input: {
    source: {
      file: Blob | Uint8Array;
      type: SkillArchiveType;
    };
  }): Promise<SkillDetail>;
}

export interface SkillsListOptions {
  cursor?: string;
  limit?: number;
}

export interface TasksListOptions {
  agentId?: string;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface TaskRunsListOptions {
  cursor?: string;
  limit?: number;
}

export interface TaskRunMessagesOptions {
  after?: string;
  cursor?: string;
  limit?: number;
}

export interface TasksResource {
  cancelRun(taskId: string, runId: string): Promise<void>;
  create(body: CreateTaskBody): Promise<CreateTaskResponse>;
  createRun(
    taskId: string,
    body?: CreateTaskRunBody
  ): Promise<CreateTaskRunResponse>;
  delete(taskId: string): Promise<void>;
  get(taskId: string): Promise<TaskResponse>;
  getRun(taskId: string, runId: string): Promise<TaskRunResponse>;
  list(options?: TasksListOptions): Promise<TasksListResponse>;
  listRuns(
    taskId: string,
    options?: TaskRunsListOptions
  ): Promise<TaskRunsListResponse>;
  runMessages(
    taskId: string,
    runId: string,
    options?: TaskRunMessagesOptions
  ): Promise<TaskRunMessagesResponse>;
  update(taskId: string, body: UpdateTaskBody): Promise<TaskResponse>;
}

export interface TenantResource {
  get(): Promise<TenantSettingsResponse>;
  patch(body: UpdateTenantSettingsBody): Promise<TenantSettingsResponse>;
}

export interface UsageResource {
  get(query?: Partial<UsageQuery>): Promise<UsageResponse>;
  getForAgent(
    agentId: string,
    query?: Partial<UsageQuery>
  ): Promise<UsageResponse>;
}
