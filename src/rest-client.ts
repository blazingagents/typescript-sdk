import { clientConfig, setClientConfig } from "./client-config.ts";
import {
  type AgentsResource,
  createAgentsResource,
} from "./resources/agents.ts";
import {
  type ArtifactsResource,
  createArtifactsResource,
} from "./resources/artifacts.ts";
import {
  type ChatConnectionsResource,
  createChatConnectionsResource,
} from "./resources/chat-connections.ts";
import {
  createMcpConnectionsResource,
  type McpConnectionsResource,
} from "./resources/mcp-connections.ts";
import {
  createMemoriesResource,
  type MemoriesResource,
} from "./resources/memories.ts";
import {
  createMerchantBindingsResource,
  type MerchantBindingsResource,
} from "./resources/merchant-bindings.ts";
import {
  createMerchantConnectionResource,
  type MerchantConnectionResource,
} from "./resources/merchant-connection.ts";
import {
  createMerchantUsageEventsResource,
  type MerchantUsageEventsResource,
} from "./resources/merchant-usage-events.ts";
import {
  createPromptsResource,
  type PromptsResource,
} from "./resources/prompts.ts";
import {
  createProvidersResource,
  type ProvidersResource,
} from "./resources/providers.ts";
import {
  createSessionsResource,
  type SessionsResource,
} from "./resources/sessions.ts";
import { createAgentSkillsResource } from "./resources/skills.ts";
import { createTasksResource, type TasksResource } from "./resources/tasks.ts";
import {
  createTenantResource,
  type TenantResource,
} from "./resources/tenant.ts";
import { createUsageResource, type UsageResource } from "./resources/usage.ts";
import {
  createWorkspacesResource,
  type WorkspacesResource,
} from "./resources/workspaces.ts";
import type {
  AgentClient,
  BlazingAgentsOptions,
  BlazingAgentsRequestOptions,
  HttpConfig,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://api.blazingagents.com";

const TRAILING_SLASH_RE = /\/+$/;

/** Every `/v1` resource, without chat or generation. */
export class BlazingAgentsRest {
  readonly chatConnections: ChatConnectionsResource;
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

  /**
   * Creates a client. Defaults to the hosted API and removes trailing base URL slashes.
   * @param options - Configuration for this operation.
   */
  constructor(options: BlazingAgentsOptions) {
    const config: HttpConfig = {
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
    setClientConfig(this, config);
    this.chatConnections = createChatConnectionsResource(config);
    this.agents = createAgentsResource(config);
    this.sessions = createSessionsResource(config);
    this.providers = createProvidersResource(config);
    this.mcpConnections = createMcpConnectionsResource(config);
    this.memories = createMemoriesResource(config);
    this.prompts = createPromptsResource(config);
    this.usage = createUsageResource(config);
    this.artifacts = createArtifactsResource(config);
    this.tasks = createTasksResource(config);
    this.tenant = createTenantResource(config);
    this.workspaces = createWorkspacesResource(config);
    this.merchantConnection = createMerchantConnectionResource(config);
    this.merchantBindings = createMerchantBindingsResource(config);
    this.merchantUsageEvents = createMerchantUsageEventsResource(config);
  }

  /**
   * Returns the Skill operations for the selected Agent.
   * @returns The selected Agent Skill client.
   */
  agent({ agentId }: { agentId: string }): AgentClient {
    return { skills: createAgentSkillsResource(clientConfig(this), agentId) };
  }

  /**
   * Returns a lightweight client view whose resource calls carry
   * caller-owned correlation without raw header manipulation.
   * @param options - Caller-owned request correlation ID for subsequent calls.
   * @returns A new client carrying the supplied correlation ID.
   */
  withOptions(options: BlazingAgentsRequestOptions): BlazingAgentsRest {
    return new BlazingAgentsRest({
      ...clientConfig(this),
      clientRequestId: options.clientRequestId,
    });
  }
}
