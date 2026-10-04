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
  ResumeSessionInputsResponse,
  SessionInputResponse,
  SessionInputsQuery,
  SessionInputsResponse,
  StopSessionBody,
  StopSessionResponse,
  SubmitSessionInputBody,
} from "./contracts/entities/session-inputs.ts";
import type {
  DecideToolApprovalBody,
  LatestSessionsListResponse,
  SessionMessagesResponse,
  SessionResponse,
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
  agent(input: { agentId: string }): AgentClient;
  readonly agents: AgentsResource;
  readonly artifacts: ArtifactsResource;
  chat(input: ChatInput): Promise<ChatResult>;
  completion(input: CompletionInput): Promise<CompletionResult>;
  readonly memories: MemoriesResource;
  object(input: ObjectInput): Promise<ObjectResult>;
  readonly prompts: PromptsResource;
  resumeChat(input: ResumeChatInput): Promise<ChatResult>;
  readonly sessions: SessionsResource;
  readonly tasks: TasksResource;
  readonly usage: Pick<UsageResource, "get" | "sessions">;
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
  promptId: string;
  variables?: Record<string, string>;
}

export type ChatMessageInput = ChatMessageContentInput & ChatSessionInput;
export type ChatPromptInput = ChatPromptContentInput & ChatSessionInput;
export type ChatInput = ChatMessageInput | ChatPromptInput;

/** Reattaches handlers to a Session's tool-approval continuation. */
export interface ResumeChatInput extends CorrelatedRequestInput {
  abortSignal?: AbortSignal;
  agentId: string;
  /** The decided continuation; omitted, the Session's queued or running one is resumed. */
  continuationId?: string;
  functions: ChatFunctions;
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
  list(input?: AgentsListOptions): Promise<AgentsResponse>;
  listMcpAttachments(
    input: { agentId: string } & ResourceRequestOptions
  ): Promise<McpAttachmentsResponse>;
  removeAvatar(
    input: { agentId: string } & ResourceRequestOptions
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
  cursor?: string;
  limit?: number;
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
    input?: {
      userId?: string;
      agentId?: string;
      cursor?: string;
      limit?: number;
    } & ResourceRequestOptions
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
  deleteInput(
    input: {
      agentId: string;
      sessionId: string;
      requestId: string;
    } & ResourceRequestOptions
  ): Promise<SessionInputResponse>;
  get(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<SessionResponse>;
  /** Poll from the first page for state changes; cursor only paginates receipts. */
  inputs(
    input: { agentId: string; sessionId: string } & SessionInputsQuery &
      ResourceRequestOptions
  ): Promise<SessionInputsResponse>;
  /** Replays an admitted input Turn. Supplying functions opts into executor claims. */
  joinInputTurn(
    input: {
      agentId: string;
      sessionId: string;
      turnId: string;
      functions?: ChatFunctions;
    } & ResourceRequestOptions
  ): Promise<TerminalStreamResult>;
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
   * `GET /v1/sessions/latest` — the Tenant's most recently updated Sessions,
   * newest first. Set `byAgent` to return at most one Session per Agent.
   * `userId` narrows the candidate Sessions to one end user's.
   */
  listLatest(
    input?: LatestSessionsListOptions
  ): Promise<LatestSessionsListResponse>;
  messages(
    input: { agentId: string; sessionId: string } & SessionMessagesOptions
  ): Promise<SessionMessagesResponse>;
  promoteInput(
    input: {
      agentId: string;
      sessionId: string;
      requestId: string;
    } & ResourceRequestOptions
  ): Promise<SessionInputResponse>;
  /** Resume accepted inputs after a pause. Uncertain inputs are never replayed. */
  resumeInputs(
    input: { agentId: string; sessionId: string } & ResourceRequestOptions
  ): Promise<ResumeSessionInputsResponse>;
  /** Admits the pending batch without resubmitting its messages. */
  runInputs(
    input: {
      agentId: string;
      sessionId: string;
      functions?: ChatFunctions;
    } & ResourceRequestOptions
  ): Promise<TerminalStreamResult>;
  /** Wait for settlement of the named Turn. A queued Turn may already be running. */
  stop(
    input: { agentId: string; sessionId: string } & StopSessionBody &
      ResourceRequestOptions
  ): Promise<StopSessionResponse>;
  /** Retry an uncertain acknowledgement with the same requestId and payload. */
  submitInput(
    input: Omit<SubmitSessionInputBody, "message"> & {
      agentId: string;
      sessionId: string;
      message: UIMessage;
    } & ResourceRequestOptions
  ): Promise<SessionInputResponse>;
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
  /** Returns totals, daily usage, and bounded Agent, user, and model rankings. */
  overview(
    input?: Partial<UsageOverviewQuery> & ResourceRequestOptions
  ): Promise<UsageOverviewResponse>;
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
  create(
    input: CreateMerchantConnectionBody & ResourceRequestOptions
  ): Promise<MerchantConnectionResponse>;
  get(input?: ResourceRequestOptions): Promise<MerchantConnectionResponse>;
  /** Retires the connection; deliveries stop (`DELETE` → 204). */
  retire(input?: ResourceRequestOptions): Promise<void>;
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
  delete(input: { userId: string } & ResourceRequestOptions): Promise<void>;
  list(input?: MerchantBindingsListOptions): Promise<MerchantBindingsResponse>;
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
  discard(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  get(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  list(
    input?: MerchantUsageEventsListOptions
  ): Promise<MerchantUsageEventsResponse>;
  release(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  retry(
    input: { eventId: string } & ResourceRequestOptions
  ): Promise<MerchantUsageEventResponse>;
  summary(
    input?: { days?: number } & ResourceRequestOptions
  ): Promise<MerchantUsageSummaryResponse>;
}

export interface ChatConnectionsResource {
  checkHealth(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  create(
    input: CreateChatConnectionBody & ResourceRequestOptions
  ): Promise<ChatConnection>;
  delete(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<void>;
  disable(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  enable(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  get(
    input: { chatConnectionId: string } & ResourceRequestOptions
  ): Promise<ChatConnection>;
  list(input?: ResourceRequestOptions): Promise<ChatConnectionsResponse>;
  rotateCredentials(
    input: RotateChatConnectionBody & {
      chatConnectionId: string;
    } & ResourceRequestOptions
  ): Promise<ChatConnection>;
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
  list(input?: ChatDeliveriesListOptions): Promise<ChatDeliveriesResponse>;
}
