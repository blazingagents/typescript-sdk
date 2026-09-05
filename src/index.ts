/**
 * `@blazingagents/sdk` — the resource-style client SDK for the
 * Blazing Agents `/v1` API. `ai` is a peer dependency (`^7`);
 * `UIMessage` is re-exported from `ai`, never redeclared.
 *
 * This is the package's entry point — a barrel file that re-exports the
 * public surface from the internal modules.
 */

export type { UIMessage } from "ai";
// biome-ignore lint/performance/noBarrelFile: package entry point
export {
  BlazingAgentsChatTransport,
  type BlazingAgentsChatTransportOptions,
} from "./chat-transport.ts";
export { BlazingAgents } from "./client.ts";
export type {
  Agent,
  AgentResponse,
  AgentsResponse,
  AgentVersion,
  AgentVersionsListQuery,
  AgentVersionsResponse,
  CreateAgentBody,
  UpdateAgentBody,
} from "./contracts/entities/agents.ts";
export type {
  ArtifactDownloadUrlResponse,
  ArtifactListItem,
  ArtifactsListResponse,
} from "./contracts/entities/artifacts.ts";
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
  CreateProviderBody,
  ProviderModel,
  ProviderModelsResponse,
  ProviderResponse,
  ProvidersResponse,
  ProviderType,
  ThinkingLevelsResponse,
  UpdateProviderBody,
} from "./contracts/entities/providers.ts";
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
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  Workspace,
  WorkspaceNetworkPolicy,
  WorkspacesListResponse,
} from "./contracts/entities/workspaces.ts";
export { BlazingAgentsError } from "./errors.ts";
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
  AgentVersionsListOptions,
  ArtifactsResource,
  AttributionInput,
  BlazingAgentsErrorCode,
  BlazingAgentsOptions,
  BlazingAgentsRequestOptions,
  BlazingAgentsUIMessage,
  BlazingAgentsUIMessageChunk,
  ChatInput,
  ChatMessageInput,
  ChatPromptInput,
  ChatResult,
  ChatTrigger,
  CompletionInput,
  CompletionPromptIdInput,
  CompletionPromptInput,
  CompletionResult,
  KnownBlazingAgentsErrorCode,
  McpConnectionsResource,
  MemoriesListOptions,
  MemoriesResource,
  ObjectInput,
  ObjectPromptIdInput,
  ObjectPromptInput,
  ObjectResult,
  PromptsResource,
  ProvidersResource,
  ResponseObservation,
  SessionsResource,
  SkillsListOptions,
  TasksResource,
  TenantResource,
  TerminalStreamResult,
  UsageResource,
  WorkspacesListOptions,
  WorkspacesResource,
} from "./types.ts";
