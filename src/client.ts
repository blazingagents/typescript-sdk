import { z } from "zod";
import {
  chat,
  completion,
  objectGeneration,
  resumeChat,
} from "./generation.ts";
import { createAgentsResource } from "./resources/agents.ts";
import { createArtifactsResource } from "./resources/artifacts.ts";
import { createChatConnectionsResource } from "./resources/chat-connections.ts";
import { createChatDeliveriesResource } from "./resources/chat-deliveries.ts";
import { createMcpConnectionsResource } from "./resources/mcp-connections.ts";
import { createMemoriesResource } from "./resources/memories.ts";
import { createMerchantBindingsResource } from "./resources/merchant-bindings.ts";
import { createMerchantConnectionResource } from "./resources/merchant-connection.ts";
import { createMerchantUsageEventsResource } from "./resources/merchant-usage-events.ts";
import { createPromptsResource } from "./resources/prompts.ts";
import { createProvidersResource } from "./resources/providers.ts";
import { createSessionsResource } from "./resources/sessions.ts";
import { createAgentSkillsResource } from "./resources/skills.ts";
import { createTasksResource } from "./resources/tasks.ts";
import { createTenantResource } from "./resources/tenant.ts";
import { createUsageResource } from "./resources/usage.ts";
import { createWorkspacesResource } from "./resources/workspaces.ts";
import type {
  AgentClient,
  AgentsResource,
  ArtifactsResource,
  BlazingAgentsOptions,
  BlazingAgentsRequestOptions,
  ChatConnectionsResource,
  ChatDeliveriesResource,
  ChatInput,
  ChatResult,
  CompletionInput,
  CompletionResult,
  HttpConfig,
  McpConnectionsResource,
  MemoriesResource,
  MerchantBindingsResource,
  MerchantConnectionResource,
  MerchantUsageEventsResource,
  ObjectInput,
  ObjectResult,
  PromptsResource,
  ProvidersResource,
  ResumeChatInput,
  SessionsResource,
  TasksResource,
  TenantResource,
  UsageResource,
  UserClient,
  WorkspacesResource,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://api.blazingagents.com";

const TRAILING_SLASH_RE = /\/+$/;
const scopedUserIdSchema = z
  .string()
  .max(256)
  .regex(/^[\x21-\x7E](?:[\x20-\x7E]*[\x21-\x7E])?$/);

function createUserClient(config: HttpConfig): UserClient {
  const usage = createUsageResource(config);
  return {
    agents: createAgentsResource(config),
    sessions: createSessionsResource(config),
    prompts: createPromptsResource(config),
    tasks: createTasksResource(config),
    artifacts: createArtifactsResource(config),
    workspaces: createWorkspacesResource(config),
    memories: createMemoriesResource(config),
    usage: { get: usage.get, sessions: usage.sessions },
    agent: ({ agentId }) => ({
      skills: createAgentSkillsResource(config, agentId),
    }),
    chat: (input) => chat(config, input),
    completion: (input) => completion(config, input),
    object: (input) => objectGeneration(config, input),
    resumeChat: (input) => resumeChat(config, input),
    withOptions: (options) =>
      createUserClient({ ...config, clientRequestId: options.clientRequestId }),
  };
}

export class BlazingAgents {
  private readonly config: HttpConfig;

  readonly chatConnections: ChatConnectionsResource;
  readonly chatDeliveries: ChatDeliveriesResource;
  readonly agents: AgentsResource;
  readonly sessions: SessionsResource;
  readonly providers: ProvidersResource;
  readonly mcpConnections: McpConnectionsResource;
  readonly memories: MemoriesResource;
  readonly prompts: PromptsResource;
  readonly usage: UsageResource;
  readonly artifacts: ArtifactsResource;
  readonly tasks: TasksResource;
  readonly tenant: TenantResource;
  readonly workspaces: WorkspacesResource;
  readonly merchantConnection: MerchantConnectionResource;
  readonly merchantBindings: MerchantBindingsResource;
  readonly merchantUsageEvents: MerchantUsageEventsResource;

  constructor(options: BlazingAgentsOptions) {
    this.config = {
      apiKey: options.apiKey,
      baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(
        TRAILING_SLASH_RE,
        ""
      ),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.clientRequestId === undefined
        ? {}
        : { clientRequestId: options.clientRequestId }),
      onResponse: options.onResponse,
    };
    this.chatConnections = createChatConnectionsResource(this.config);
    this.chatDeliveries = createChatDeliveriesResource(this.config);
    this.agents = createAgentsResource(this.config);
    this.sessions = createSessionsResource(this.config);
    this.providers = createProvidersResource(this.config);
    this.mcpConnections = createMcpConnectionsResource(this.config);
    this.memories = createMemoriesResource(this.config);
    this.prompts = createPromptsResource(this.config);
    this.usage = createUsageResource(this.config);
    this.artifacts = createArtifactsResource(this.config);
    this.tasks = createTasksResource(this.config);
    this.tenant = createTenantResource(this.config);
    this.workspaces = createWorkspacesResource(this.config);
    this.merchantConnection = createMerchantConnectionResource(this.config);
    this.merchantBindings = createMerchantBindingsResource(this.config);
    this.merchantUsageEvents = createMerchantUsageEventsResource(this.config);
  }

  agent({ agentId }: { agentId: string }): AgentClient {
    return { skills: createAgentSkillsResource(this.config, agentId) };
  }

  /** Scope requests to one end user. IDs use printable ASCII, at most 256 characters, without leading or trailing spaces. */
  forUser(userId: string): UserClient {
    return createUserClient({
      ...this.config,
      scopeUserId: scopedUserIdSchema.parse(userId),
    });
  }

  /**
   * `POST /v1/agents/:agentId/sessions` (create, no `sessionId`) or
   * `POST /v1/agents/:agentId/sessions/:sessionId` (resume). Returns the
   * session id and a byte-compatible SSE relay for `useChat`.
   */
  chat(input: ChatInput): Promise<ChatResult> {
    return chat(this.config, input);
  }

  /**
   * Reattaches function handlers after human tool approval and starts or
   * joins the Session's continuation. Returns the continuation SSE relay.
   */
  resumeChat(input: ResumeChatInput): Promise<ChatResult> {
    return resumeChat(this.config, input);
  }

  /**
   * `POST /v1/agents/:agentId/generation` — stateless one-shot text
   * stream. Returns `textStream` + `await result.text` + `toResponse()`.
   */
  completion(input: CompletionInput): Promise<CompletionResult> {
    return completion(this.config, input);
  }

  /**
   * `POST /v1/agents/:agentId/generation` — stateless structured output.
   * Returns `partialObjectStream` + `await result.object` + `toResponse()`.
   */
  object(input: ObjectInput): Promise<ObjectResult> {
    return objectGeneration(this.config, input);
  }

  /**
   * Returns a lightweight client view whose resource and generation calls
   * carry caller-owned correlation without raw header manipulation.
   */
  withOptions(options: BlazingAgentsRequestOptions): BlazingAgents {
    return new BlazingAgents({
      ...this.config,
      clientRequestId: options.clientRequestId,
    });
  }
}
