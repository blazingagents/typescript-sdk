import {
  type AgentSkillsResource,
  type ArtifactDownloadUrlResponse,
  BlazingAgents,
  BlazingAgentsDirectChatTransport,
  BlazingAgentsError,
  type BlazingAgentsErrorCode,
  type BlazingAgentsOptions,
  type BlazingAgentsUIMessage,
  type ChatInput,
  type CompletionInput,
  type KnownBlazingAgentsErrorCode,
  type ObjectInput,
  type ResourceRequestOptions,
  type SkillCopyResults,
  type SkillDetail,
} from "@blazingagents/sdk";

const options = {
  apiKey: "ba_consumer_contract",
  baseUrl: "http://127.0.0.1:8787",
} satisfies BlazingAgentsOptions;

const client = new BlazingAgents(options);
const readOptions = {
  abortSignal: new AbortController().signal,
} satisfies ResourceRequestOptions;
export const nativeTransport = new BlazingAgentsDirectChatTransport({
  client,
  agentId: "ag_0123456789abcdef",
});
// @ts-expect-error API-key lifecycle is dashboard-only and absent from the SDK.
export const removedApiKeysResource = client.apiKeys;
const knownErrorCode: KnownBlazingAgentsErrorCode = "invalid_response";
const futureErrorCode: BlazingAgentsErrorCode = "future_server_outcome";
const publicError = new BlazingAgentsError(
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

const chatInput = {
  ...readOptions,
  agentId: "ag_0123456789abcdef",
  message: {
    id: "consumer-message",
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
  },
} satisfies ChatInput;

const completionInput = {
  agentId: "ag_0123456789abcdef",
  prompt: "Hello",
  ...readOptions,
} satisfies CompletionInput;

const objectInput = {
  agentId: "ag_0123456789abcdef",
  prompt: "Return an object",
  schema: { type: "object" },
  ...readOptions,
} satisfies ObjectInput;
type HasTopLevelSkills = "skills" extends keyof BlazingAgents ? true : false;
export const hasTopLevelSkills: HasTopLevelSkills = false;
const skillsResource: AgentSkillsResource = client.agent({
  agentId: "ag_0123456789abcdef",
}).skills;

export async function publicApiConsumer() {
  const agents = await client.agents.list(readOptions);
  await client.sessions.list({
    agentId: "ag_0123456789abcdef",
    ...readOptions,
  });
  await client.sessions.messages({
    agentId: "ag_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
    ...readOptions,
  });
  const implicitWorkspaceAgent = await client.agents.create({
    name: "Implicit Workspace Agent",
    ...readOptions,
  });
  const implicitWorkspaceId: string = implicitWorkspaceAgent.workspaceId;
  const artifactDownload: ArtifactDownloadUrlResponse =
    await client.artifacts.createDownloadUrl({
      artifactId: "at_0123456789abcdef",
      ...readOptions,
    });
  await client.artifacts.get({ artifactId: "at_0123456789abcdef" });
  const chat = await client.chat(chatInput);
  const chatResponse: Response = chat.toResponse();
  const completion = await client.completion(completionInput);
  const object = await client.object(objectInput);
  const skill: SkillDetail = await skillsResource.create({
    content: "---\nname: test\ndescription: Test.\n---\n",
    path: "SKILL.md",
  });
  const skillCopies: SkillCopyResults = await skillsResource.copy({
    skillId: "skill_0123456789abcdef",
    to: { agentIds: ["ag_fedcba9876543210"] },
  });
  const continuation = await client.sessions.joinToolApprovalContinuation({
    agentId: "ag_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
    continuationId: "continuation-1",
    ...readOptions,
  });
  const message: BlazingAgentsUIMessage = {
    id: "assistant-message",
    role: "assistant",
    parts: [{ type: "text", text: "Hello" }],
  };

  return {
    agents,
    artifactDownload,
    chat,
    chatRequestId: chat.requestId,
    chatResponse,
    completion,
    completionRequestId: completion.requestId,
    continuationRequestId: continuation.requestId,
    errorCause: publicError.cause,
    errorCode: publicError.code,
    errorDetails: publicError.details,
    errorHeaders: publicError.headers,
    errorParam: publicError.param,
    errorRequestId: publicError.requestId,
    errorResponseBody: publicError.responseBody,
    errorResponseBodyTruncated: publicError.responseBodyTruncated,
    errorStatus: publicError.status,
    futureErrorCode,
    implicitWorkspaceId,
    knownErrorCode,
    message,
    object,
    objectRequestId: object.requestId,
    skill,
    skillCopies,
  };
}

export async function manageChatConnections() {
  const telegram = await client.chatConnections.create({
    agentId: "ag_0123456789abcdef",
    name: "Support",
    platform: "telegram",
    configuration: {
      botId: "123",
      webhookUrl: "https://api.example.com/callback",
    },
    credentials: { botToken: "123:token", webhookSecret: "secret" },
  });
  await client.chatConnections.create({
    agentId: "ag_0123456789abcdef",
    name: "Support",
    platform: "slack",
    configuration: {
      teamId: "T123",
      appId: "A123",
      webhookUrl: "https://api.example.com/callback",
    },
    credentials: { botToken: "xoxb-token", signingSecret: "a".repeat(32) },
  });
  const chatConnectionId = telegram.id;
  await client.chatConnections.rotateCredentials({
    chatConnectionId,
    platform: "telegram",
    botToken: "123:new",
    webhookSecret: "new",
  });
  await client.chatConnections.update({ chatConnectionId, name: "Renamed" });
  await client.chatConnections.checkHealth({ chatConnectionId });
  await client.chatConnections.enable({ chatConnectionId });
  await client.chatConnections.disable({ chatConnectionId });
  await client.chatConnections.get({ chatConnectionId });
  await client.chatConnections.list();
  await client.chatConnections.delete({ chatConnectionId });
  return telegram;
}
