import {
  type AgentSkillsResource,
  type ArtifactDownloadUrlResponse,
  BlazingAgents,
  BlazingAgentsError,
  type BlazingAgentsErrorCode,
  type BlazingAgentsOptions,
  type BlazingAgentsUIMessage,
  type ChatInput,
  type CompletionInput,
  type KnownBlazingAgentsErrorCode,
  type ObjectInput,
  type SkillCopyResults,
  type SkillDetail,
} from "@blazingagents/sdk";

const options = {
  apiKey: "ba_consumer_contract",
  baseUrl: "http://127.0.0.1:8787",
} satisfies BlazingAgentsOptions;

const client = new BlazingAgents(options);
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
} satisfies CompletionInput;

const objectInput = {
  agentId: "ag_0123456789abcdef",
  prompt: "Return an object",
  schema: { type: "object" },
} satisfies ObjectInput;
type HasTopLevelSkills = "skills" extends keyof BlazingAgents ? true : false;
export const hasTopLevelSkills: HasTopLevelSkills = false;
const skillsResource: AgentSkillsResource = client.agent(
  "ag_0123456789abcdef"
).skills;

export async function publicApiConsumer() {
  const agents = await client.agents.list();
  const implicitWorkspaceAgent = await client.agents.create({
    name: "Implicit Workspace Agent",
  });
  const implicitWorkspaceId: string = implicitWorkspaceAgent.workspaceId;
  const artifactDownload: ArtifactDownloadUrlResponse =
    await client.artifacts.createDownloadUrl("at_0123456789abcdef");
  await client.artifacts.get("at_0123456789abcdef");
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
  const continuation = await client.sessions.joinToolApprovalContinuation(
    "ag_0123456789abcdef",
    "ss_0123456789abcdef",
    "continuation-1"
  );
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
