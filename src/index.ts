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
export {
  AGENT_TOOL_FILE_ACCESS_TAGS,
  AGENT_TOOL_GROUPS,
  AGENT_TOOL_TAGS,
  AGENT_TOOLS,
  type AgentToolDefinition,
  type AgentToolFileAccessTag,
  type AgentToolGroupTag,
  type AgentToolName,
  type AgentToolTag,
  type AgentToolTags,
} from "./contracts/entities/agent-tools.ts";
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
  ChatHealth,
  ChatIdentity,
  CreateChatConnectionBody,
  RotateChatConnectionBody,
  UpdateChatConnectionBody,
} from "./contracts/entities/chat-connections.ts";
export type {
  CreateMcpConnectionBody,
  McpAttachmentResponse,
  McpAttachmentsResponse,
  McpConnectionAuthType,
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
  SessionForkedFrom,
  SessionResponse,
  ToolApprovalDecision,
  ToolApprovalState,
  ToolApprovalsResponse,
  TurnStreamErrorEvent,
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
  SpendingLimit,
  SpendingLimitResponse,
  SpendingLimitStopDetails,
  UpdateSpendingLimitBody,
} from "./contracts/entities/spending-limits.ts";
export { nextSpendingLimitReset } from "./contracts/entities/spending-limits.ts";
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
  WorkspaceTier,
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
} from "./relay.ts";
export type {
  AgentsListOptions,
  AgentsResource,
  UserAgentsResource,
} from "./resources/agents.ts";
export type { ArtifactsResource } from "./resources/artifacts.ts";
export type { ChatConnectionsResource } from "./resources/chat-connections.ts";
export type { McpConnectionsResource } from "./resources/mcp-connections.ts";
export type {
  MemoriesListOptions,
  MemoriesResource,
} from "./resources/memories.ts";
export type {
  MerchantBindingsListOptions,
  MerchantBindingsResource,
} from "./resources/merchant-bindings.ts";
export type { MerchantConnectionResource } from "./resources/merchant-connection.ts";
export type {
  MerchantUsageEventsListOptions,
  MerchantUsageEventsResource,
} from "./resources/merchant-usage-events.ts";
export type { PromptsResource } from "./resources/prompts.ts";
export type { ProvidersResource } from "./resources/providers.ts";
export type {
  LatestSessionsListOptions,
  SessionsResource,
} from "./resources/sessions.ts";
export type {
  AgentSkillsResource,
  SkillsListOptions,
} from "./resources/skills.ts";
export type { TasksResource } from "./resources/tasks.ts";
export type { TenantResource } from "./resources/tenant.ts";
export type { UsageResource } from "./resources/usage.ts";
export type {
  WorkspacesListOptions,
  WorkspacesResource,
} from "./resources/workspaces.ts";
export type {
  AgentClient,
  AttributionInput,
  BlazingAgentsErrorCode,
  BlazingAgentsOptions,
  BlazingAgentsRequestOptions,
  BlazingAgentsUIMessage,
  BlazingAgentsUIMessageChunk,
  BlazingAgentsUIMessageData,
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
  ObjectInput,
  ObjectPromptIdInput,
  ObjectPromptInput,
  ObjectResult,
  ResourceRequestOptions,
  ResponseObservation,
  TerminalStreamResult,
  UserClient,
} from "./types.ts";
