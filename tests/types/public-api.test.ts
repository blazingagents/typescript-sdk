import {
  type AgentResponse,
  BlazingAgents,
  BlazingAgentsError,
  type BlazingAgentsErrorCode,
  type BlazingAgentsUIMessage,
  type CreateAgentBody,
  type CreateWorkspaceBody,
  type KnownBlazingAgentsErrorCode,
  type UpdateAgentBody,
  type Workspace,
  type WorkspacesListOptions,
} from "../../src/index.ts";

const sdk = new BlazingAgents({ apiKey: "ba_test" });
export const sdkWithBaseUrl = new BlazingAgents({
  apiKey: "ba_test",
  baseUrl: "https://example.test",
});
export const sdkWithFetch = new BlazingAgents({
  apiKey: "ba_test",
  fetch: globalThis.fetch,
});
// @ts-expect-error authentication is required
export const sdkWithoutAuth = new BlazingAgents({});

export const knownErrorCode: KnownBlazingAgentsErrorCode = "request_aborted";
export const futureErrorCode: BlazingAgentsErrorCode = "future_server_outcome";
// @ts-expect-error future codes are accepted by the open type, not the known union
export const unknownKnownErrorCode: KnownBlazingAgentsErrorCode =
  "future_server_outcome";

export const publicError = new BlazingAgentsError(
  {
    code: futureErrorCode,
    details: { recovery: "refresh" },
    headers: new Headers({ "x-request-id": "request-error" }),
    message: "A newer server outcome.",
    param: "/version",
    requestId: "request-error",
    responseBody: "diagnostic",
    responseBodyTruncated: true,
    status: 422,
  },
  { cause: new Error("underlying") }
);
export const publicErrorProperties = {
  cause: publicError.cause,
  code: publicError.code,
  details: publicError.details?.recovery,
  headers: publicError.headers?.get("x-request-id"),
  param: publicError.param?.toUpperCase(),
  requestId: publicError.requestId?.toUpperCase(),
  responseBody: publicError.responseBody?.toUpperCase(),
  responseBodyTruncated: publicError.responseBodyTruncated?.valueOf(),
  status: publicError.status?.toFixed(),
};

const message = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "hello" }],
};

sdk.chat({ agentId: "ag_0123456789abcdef", message });
sdk.chat({ agentId: "ag_0123456789abcdef", message, version: 7 });
// @ts-expect-error a new Session cannot regenerate a message
sdk.chat({
  agentId: "ag_0123456789abcdef",
  message,
  trigger: "regenerate-message",
});
sdk.chat({ agentId: "ag_0123456789abcdef", message }).then((result) => {
  const response: Response = result.toResponse();
  result.requestId?.toUpperCase();
  return response;
});

const assistantMessage: BlazingAgentsUIMessage = {
  id: "assistant-message",
  role: "assistant",
  metadata: {
    blazingAgents: {
      usage: {
        agentId: "ag_0123456789abcdef",
        agentVersion: 1,
        commitId: "commit-1",
        completedAt: "2026-07-16T10:00:01.000Z",
        durationMs: 1000,
        errorMessage: null,
        inputTokens: 4,
        modelDurationMs: 250,
        metadata: {},
        modelId: "openrouter/test-model",
        outputTokens: 2,
        sessionId: "ss_0123456789abcdef",
        startedAt: "2026-07-16T10:00:00.000Z",
        status: "succeeded",
        stepUsages: [{ inputTokens: 4, outputTokens: 2, stepNumber: 0 }],
        tenantId: "ten_0123456789abcdef",
        turnId: "turn_0123456789abcdef",
        userId: "",
      },
    },
  },
  parts: [{ type: "text", text: "hello" }],
};
assistantMessage.metadata?.blazingAgents.usage.outputTokens.toFixed();
sdk.chat({
  agentId: "ag_0123456789abcdef",
  message,
  sessionId: "ss_0123456789abcdef",
  trigger: "regenerate-message",
});
sdk.chat({
  agentId: "ag_0123456789abcdef",
  message,
  messageId: "message-1",
  sessionId: "ss_0123456789abcdef",
  trigger: "regenerate-message",
});
// @ts-expect-error an existing Session cannot be repinned
sdk.chat({
  agentId: "ag_0123456789abcdef",
  message,
  sessionId: "ss_0123456789abcdef",
  version: 7,
});
// @ts-expect-error sessionId must be a string
sdk.chat({ agentId: "ag_0123456789abcdef", message, sessionId: 1 });
sdk.chat({ agentId: "ag_0123456789abcdef", promptId: "prompt_1" });
// @ts-expect-error literal and stored chat prompts are mutually exclusive
sdk.chat({ agentId: "ag_0123456789abcdef", message, promptId: "prompt_1" });

sdk
  .completion({ agentId: "ag_0123456789abcdef", prompt: "hello" })
  .then((result) => result.requestId?.toUpperCase());
sdk.completion({ agentId: "ag_0123456789abcdef", promptId: "prompt_1" });
// @ts-expect-error literal and stored completion prompts are mutually exclusive
sdk.completion({
  agentId: "ag_0123456789abcdef",
  prompt: "hello",
  promptId: "prompt_1",
});
// @ts-expect-error completion does not accept object-output fields
sdk.completion({ agentId: "ag_0123456789abcdef", prompt: "hello", schema: {} });

sdk
  .object({ agentId: "ag_0123456789abcdef", prompt: "hello", schema: {} })
  .then((result) => result.requestId?.toUpperCase());
sdk.object({
  agentId: "ag_0123456789abcdef",
  promptId: "prompt_1",
  schema: {},
});
// @ts-expect-error object generation requires a schema
sdk.object({ agentId: "ag_0123456789abcdef", prompt: "hello" });
// @ts-expect-error literal and stored object prompts are mutually exclusive
sdk.object({
  agentId: "ag_0123456789abcdef",
  prompt: "hello",
  promptId: "prompt_1",
  schema: {},
});

sdk.agents.create({ name: "implicit workspace" }).then((agent) => {
  const workspaceId: string = agent.workspaceId;
  workspaceId.toUpperCase();
});
sdk.agents.create({
  name: "shared workspace",
  workspaceId: "ws_0123456789abcdef",
});
sdk.agents.update("ag_0123456789abcdef", { name: "renamed" });
sdk.agents.update("ag_0123456789abcdef", {
  workspaceId: "ws_fedcba9876543210",
});
// @ts-expect-error an Agent cannot be created detached from a Workspace
sdk.agents.create({ name: "detached", workspaceId: null });
// @ts-expect-error an Agent cannot be detached from its Workspace
sdk.agents.update("ag_0123456789abcdef", { workspaceId: null });
sdk.agents.list({ workspaceId: "ws_0123456789abcdef" });
const createAgentWithMcp = {
  name: "connected",
  mcpConnectionIds: ["mcp_0123456789abcdef"],
} satisfies CreateAgentBody;
const updateAgentMcp = {
  mcpConnectionIds: [],
} satisfies UpdateAgentBody;
sdk.agents.create(createAgentWithMcp);
sdk.agents.update("ag_0123456789abcdef", updateAgentMcp);
sdk.agents
  .get("ag_0123456789abcdef")
  .then((agent: AgentResponse) =>
    agent.mcpConnectionIds.map((id) => id.toUpperCase())
  );
const createWorkspace = {
  metadata: { project: "docs" },
  name: "Release files",
  userId: "user_42",
} satisfies CreateWorkspaceBody;
const workspaceList = {
  limit: 25,
  userId: "user_42",
} satisfies WorkspacesListOptions;
sdk.workspaces.create(createWorkspace).then((workspace: Workspace) => {
  workspace.id.toUpperCase();
});
sdk.workspaces.list(workspaceList);
sdk.workspaces.get({ workspaceId: "ws_0123456789abcdef" });
sdk.workspaces.update({
  workspaceId: "ws_0123456789abcdef",
  name: null,
});
sdk.workspaces.delete({ workspaceId: "ws_0123456789abcdef" });
// @ts-expect-error agent id is immutable
sdk.agents.update("ag_0123456789abcdef", { id: "ag_other" });
sdk.prompts.update("prompt_0123456789abcdef", { name: "renamed" });
// @ts-expect-error prompt tenant is immutable
sdk.prompts.update("prompt_0123456789abcdef", { tenantId: "ten_other" });
sdk.tasks.update("tk_0123456789abcdef", { name: "renamed" });
sdk.tasks
  .createRun("tk_0123456789abcdef", { idempotencyKey: "submission-key" })
  .then(({ runId }) => runId.toUpperCase());
sdk.tasks
  .getRun("tk_0123456789abcdef", "tr_0123456789abcdef")
  .then((run) => run.status.toUpperCase());
sdk.tasks
  .runMessages("tk_0123456789abcdef", "tr_0123456789abcdef")
  .then((messages) => ({
    finishedAt: messages.finishedAt,
    status: messages.status,
  }));
// @ts-expect-error unknown task fields are rejected
sdk.tasks.update("tk_0123456789abcdef", { unknown: true });
sdk.sessions
  .joinToolApprovalContinuation(
    "ag_0123456789abcdef",
    "ss_0123456789abcdef",
    "continuation-1"
  )
  .then((result) => result.requestId?.toUpperCase());
