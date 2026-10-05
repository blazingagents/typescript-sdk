/**
 * `@blazingagents/sdk` — the resource-style client SDK for the
 * Blazing Agents `/v1` API. `ai` is a peer dependency (`^7`);
 * `UIMessage` is re-exported from `ai`, never redeclared.
 */

export type { UIMessage } from "ai";
// biome-ignore lint/performance/noBarrelFile: package entry point
export {
  BlazingAgentsChatTransport,
  type BlazingAgentsChatTransportOptions,
} from "./chat-transport.ts";
export { BlazingAgents } from "./client.ts";
export type {
  ApprovalDecision,
  ApprovalPolicy,
  ToolExecutionReference,
  ToolReference,
} from "./contracts/entities/agent-approval.ts";
export type {
  Agent,
  AgentConfig,
  AgentResponse,
  AgentsListQuery,
  AgentsResponse,
  CreateAgentBody,
  UpdateAgentBody,
} from "./contracts/entities/agents.ts";
export { agentConfigSchema } from "./contracts/entities/agents.ts";
export type {
  ArtifactDownloadUrlResponse,
  ArtifactListItem,
  ArtifactsListResponse,
} from "./contracts/entities/artifacts.ts";
export type {
  ChatConfiguration,
  ChatConnection,
  ChatConnectionsResponse,
  ChatCredentials,
  ChatDeliveriesResponse,
  ChatDelivery,
  ChatDeliveryListStatus,
  ChatDeliveryStatus,
  ChatHealth,
  ChatIdentity,
  CreateChatConnectionBody,
  RotateChatConnectionBody,
  TenantChatDelivery,
  UpdateChatConnectionBody,
} from "./contracts/entities/chat-connections.ts";
export type {
  CreateMcpConnectionBody,
  McpAttachmentResponse,
  McpAttachmentsResponse,
  McpConnectionAuthType,
  McpConnectionOauthConnectResponse,
  McpConnectionReconnectResult,
  McpConnectionResponse,
  McpConnectionStatus,
  McpConnectionTestResponse,
  ReconnectMcpConnectionBody,
  UpdateMcpAttachmentBody,
  UpdateMcpConnectionBody,
} from "./contracts/entities/mcp-connections.ts";
export type {
  CreateMerchantConnectionBody,
  MerchantBindingResponse,
  MerchantBindingsResponse,
  MerchantConnection,
  MerchantConnectionResponse,
  MerchantCustomerBinding,
  MerchantGuard,
  MerchantProviderKind,
  MerchantUsageEvent,
  MerchantUsageEventResponse,
  MerchantUsageEventStatus,
  MerchantUsageEventsResponse,
  MerchantUsageSummary,
  MerchantUsageSummaryResponse,
  UpdateMerchantConnectionBody,
  UpsertMerchantBindingBody,
} from "./contracts/entities/merchant.ts";
export type {
  CreatePromptBody,
  PromptResponse,
  PromptsListQuery,
  PromptsResponse,
  UpdatePromptBody,
} from "./contracts/entities/prompts.ts";
export type {
  CreateProviderBody,
  ProviderListItem,
  ProviderModel,
  ProviderModelsResponse,
  ProviderResponse,
  ProvidersResponse,
  ProviderType,
  ThinkingLevelsResponse,
  UpdateProviderBody,
} from "./contracts/entities/providers.ts";
export type {
  ChatSteerConsumedEvent,
  SessionActivity,
  SessionInput,
  SessionInputResponse,
  SessionInputState,
  SessionInputsQuery,
  SessionInputsResponse,
  StopSessionBody,
  StopSessionResponse,
  SubmitSessionInputBody,
} from "./contracts/entities/session-inputs.ts";
export type {
  ContinueToolApprovalsBody,
  SessionResponse,
  ToolApprovalDecision,
  ToolApprovalState,
  ToolApprovalsResponse,
} from "./contracts/entities/sessions.ts";
export { sessionResponseSchema } from "./contracts/entities/sessions.ts";
export type {
  CreateSkillBody,
  Skill,
  SkillArchiveType,
  SkillCopyResult,
  SkillCopyResults,
  SkillDetail,
  SkillFile,
  SkillsListResponse,
} from "./contracts/entities/skills.ts";
export type {
  SessionUsageQuery,
  SessionUsageResponse,
  UsageBucket,
  UsageOverviewQuery,
  UsageOverviewResponse,
  UsageTotals,
} from "./contracts/entities/usage.ts";
export type {
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  Workspace,
  WorkspaceNetworkPolicy,
  WorkspacesListResponse,
} from "./contracts/entities/workspaces.ts";
export {
  BlazingAgentsDirectChatTransport,
  type BlazingAgentsDirectChatTransportOptions,
} from "./direct-chat-transport.ts";
export { BlazingAgentsError } from "./errors.ts";
export {
  type ChatFunction,
  type ChatFunctionContext,
  type ChatFunctions,
  defineFunction,
} from "./functions.ts";
export {
  createChatRelay,
  createCompletionRelay,
  type RelayContext,
  type SessionOwnershipStore,
} from "./relay.ts";
export type {
  AgentClient,
  AgentSkillsResource,
  AgentsListOptions,
  AgentsResource,
  ArtifactsResource,
  AttributionInput,
  BlazingAgentsErrorCode,
  BlazingAgentsOptions,
  BlazingAgentsRequestOptions,
  BlazingAgentsUIMessage,
  BlazingAgentsUIMessageChunk,
  ChatConnectionsResource,
  ChatDeliveriesListOptions,
  ChatDeliveriesResource,
  ChatInput,
  ChatMessageInput,
  ChatMessagesInput,
  ChatPromptInput,
  ChatResult,
  ChatTrigger,
  CompletionInput,
  CompletionPromptIdInput,
  CompletionPromptInput,
  CompletionResult,
  ContinueChatInput,
  KnownBlazingAgentsErrorCode,
  LatestSessionsListOptions,
  McpConnectionsResource,
  MemoriesListOptions,
  MemoriesResource,
  MerchantBindingsListOptions,
  MerchantBindingsResource,
  MerchantConnectionResource,
  MerchantUsageEventsListOptions,
  MerchantUsageEventsResource,
  ObjectInput,
  ObjectPromptIdInput,
  ObjectPromptInput,
  ObjectResult,
  PromptsResource,
  ProvidersResource,
  ResourceRequestOptions,
  ResponseObservation,
  SessionsResource,
  SkillsListOptions,
  TasksResource,
  TenantResource,
  TerminalStreamResult,
  UsageResource,
  UserClient,
  WorkspacesListOptions,
  WorkspacesResource,
} from "./types.ts";
