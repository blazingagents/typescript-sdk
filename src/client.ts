import { chat, completion, objectGeneration } from "./generation.ts";
import { createAgentsResource } from "./resources/agents.ts";
import { createArtifactsResource } from "./resources/artifacts.ts";
import { createMcpConnectionsResource } from "./resources/mcp-connections.ts";
import { createMemoriesResource } from "./resources/memories.ts";
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
  ChatInput,
  ChatResult,
  CompletionInput,
  CompletionResult,
  HttpConfig,
  McpConnectionsResource,
  MemoriesResource,
  ObjectInput,
  ObjectResult,
  PromptsResource,
  ProvidersResource,
  SessionsResource,
  TasksResource,
  TenantResource,
  UsageResource,
  WorkspacesResource,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://api.blazingagents.com";

const TRAILING_SLASH_RE = /\/+$/;

export class BlazingAgents {
  private readonly config: HttpConfig;

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
  }

  agent(agentId: string): AgentClient {
    return { skills: createAgentSkillsResource(this.config, agentId) };
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
