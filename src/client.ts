import { z } from "zod";
import {
  chat,
  completion,
  continueChat,
  objectGeneration,
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
  ContinueChatInput,
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

/**
 * Builds a client whose requests share the configured user scope.
 */
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
    /** Returns Skill operations for the selected Agent. */
    agent: ({ agentId }) => ({
      skills: createAgentSkillsResource(config, agentId),
    }),
    /** Starts a chat using the scoped client configuration. */
    chat: (input) => chat(config, input),
    /** Starts text generation using the scoped client configuration. */
    completion: (input) => completion(config, input),
    /** Starts JSON generation using the scoped client configuration. */
    object: (input) => objectGeneration(config, input),
    /** Continues an approval round using the scoped client configuration. */
    continueChat: (input) => continueChat(config, input),
    /** Creates a scoped client view with the supplied correlation ID. */
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

  /**
   * Creates a client. Defaults to the hosted API and removes trailing base URL slashes.
   * @param options - Configuration for this operation.
   */
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

  /**
   * Returns the Skill operations for the selected Agent.
   * @returns The selected Agent Skill client.
   */
  agent({ agentId }: { agentId: string }): AgentClient {
    return { skills: createAgentSkillsResource(this.config, agentId) };
  }

  /**
   * Scope requests to one end user. IDs use printable ASCII, at most 256 characters, without leading or trailing spaces.
   * @param userId - Printable ASCII end-user ID, at most 256 characters with no surrounding spaces.
   * @returns A client scoped to the validated end-user ID.
   * @throws ZodError - If the user ID is invalid.
   */
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
   * @param input - Agent, message or stored Prompt, and optional existing Session.
   * @returns The Session ID promise and single-owner SSE accessors.
   */
  chat(input: ChatInput): Promise<ChatResult> {
    return chat(this.config, input);
  }

  /**
   * Records a complete Tool approval round and streams its continuation.
   * Caller-local function handlers apply only to this invocation.
   * @param input - Agent, Session, and decisions for the complete approval round.
   * @returns The Session ID promise and continuation SSE accessors.
   */
  continueChat(input: ContinueChatInput): Promise<ChatResult> {
    return continueChat(this.config, input);
  }

  /**
   * `POST /v1/agents/:agentId/generation` — stateless one-shot text
   * stream. Returns `textStream` + `await result.text` + `toResponse()`.
   * @param input - Agent and literal prompt or stored Prompt reference.
   * @returns Independent text stream, final text promise, and response relay.
   */
  completion(input: CompletionInput): Promise<CompletionResult> {
    return completion(this.config, input);
  }

  /**
   * `POST /v1/agents/:agentId/generation` — stateless structured output.
   * Returns `partialObjectStream` + `await result.object` + `toResponse()`.
   * @param input - Agent, prompt source, and JSON output schema.
   * @returns Partial JSON objects, a final JSON promise, and a text response relay.
   */
  object(input: ObjectInput): Promise<ObjectResult> {
    return objectGeneration(this.config, input);
  }

  /**
   * Returns a lightweight client view whose resource and generation calls
   * carry caller-owned correlation without raw header manipulation.
   * @param options - Caller-owned request correlation ID for subsequent calls.
   * @returns A new client carrying the supplied correlation ID.
   */
  withOptions(options: BlazingAgentsRequestOptions): BlazingAgents {
    return new BlazingAgents({
      ...this.config,
      clientRequestId: options.clientRequestId,
    });
  }
}
