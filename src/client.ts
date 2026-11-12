import { z } from "zod";
import { clientConfig } from "./client-config.ts";
import { parseClientInput } from "./errors.ts";
import {
  chat,
  completion,
  continueChat,
  objectGeneration,
} from "./generation.ts";
import { createUserAgentsResource } from "./resources/agents.ts";
import { createArtifactsResource } from "./resources/artifacts.ts";
import { createMemoriesResource } from "./resources/memories.ts";
import { createPromptsResource } from "./resources/prompts.ts";
import { createSessionsResource } from "./resources/sessions.ts";
import { createAgentSkillsResource } from "./resources/skills.ts";
import { createTasksResource } from "./resources/tasks.ts";
import { createUsageResource } from "./resources/usage.ts";
import { createWorkspacesResource } from "./resources/workspaces.ts";
import { BlazingAgentsRest } from "./rest-client.ts";
import type {
  BlazingAgentsRequestOptions,
  ChatInput,
  ChatResult,
  CompletionInput,
  CompletionResult,
  ContinueChatInput,
  HttpConfig,
  ObjectInput,
  ObjectResult,
  UserClient,
} from "./types.ts";

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
    agents: createUserAgentsResource(config),
    sessions: createSessionsResource(config),
    prompts: createPromptsResource(config),
    tasks: createTasksResource(config),
    artifacts: createArtifactsResource(config),
    workspaces: createWorkspacesResource(config),
    memories: createMemoriesResource(config),
    usage: {
      get: usage.get,
      getForAgent: usage.getForAgent,
      sessions: usage.sessions,
    },
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

export class BlazingAgents extends BlazingAgentsRest {
  /**
   * Scope requests to one end user. IDs use printable ASCII, at most 256 characters, without leading or trailing spaces.
   * @param userId - Printable ASCII end-user ID, at most 256 characters with no surrounding spaces.
   * @returns A client scoped to the validated end-user ID.
   * @throws BlazingAgentsError - With code `invalid_request` if the user ID is invalid.
   */
  forUser(userId: string): UserClient {
    return createUserClient({
      ...clientConfig(this),
      scopeUserId: parseClientInput(scopedUserIdSchema, userId, "userId"),
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
    return chat(clientConfig(this), input);
  }

  /**
   * Records a complete Tool approval round and streams its continuation.
   * Caller-local function handlers apply only to this invocation.
   * @param input - Agent, Session, and decisions for the complete approval round.
   * @returns The Session ID promise and continuation SSE accessors.
   */
  continueChat(input: ContinueChatInput): Promise<ChatResult> {
    return continueChat(clientConfig(this), input);
  }

  /**
   * `POST /v1/agents/:agentId/generation` — stateless one-shot text
   * stream. Returns `textStream` + `await result.text` + `toResponse()`.
   * @param input - Agent and literal prompt or stored Prompt reference.
   * @returns Independent text stream, final text promise, and response relay.
   */
  completion(input: CompletionInput): Promise<CompletionResult> {
    return completion(clientConfig(this), input);
  }

  /**
   * `POST /v1/agents/:agentId/generation` — stateless structured output.
   * Returns `partialObjectStream` + `await result.object` + `toResponse()`.
   * @param input - Agent, prompt source, and JSON output schema.
   * @returns Partial JSON objects, a final JSON promise, and a text response relay.
   */
  object(input: ObjectInput): Promise<ObjectResult> {
    return objectGeneration(clientConfig(this), input);
  }

  /**
   * Returns a lightweight client view whose resource and generation calls
   * carry caller-owned correlation without raw header manipulation.
   * @param options - Caller-owned request correlation ID for subsequent calls.
   * @returns A new client carrying the supplied correlation ID.
   */
  withOptions(options: BlazingAgentsRequestOptions): BlazingAgents {
    return new BlazingAgents({
      ...clientConfig(this),
      clientRequestId: options.clientRequestId,
    });
  }
}
