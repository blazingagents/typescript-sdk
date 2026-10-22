import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agentResponseSchema,
  agentsResponseSchema,
  artifactDownloadUrlResponseSchema,
  artifactListItemSchema,
  artifactsListResponseSchema,
  chatConnectionSchema,
  chatConnectionsResponseSchema,
  claimChatFunctionResponseSchema,
  createTaskResponseSchema,
  createTaskRunResponseSchema,
  latestSessionsListResponseSchema,
  mcpAttachmentResponseSchema,
  mcpAttachmentsResponseSchema,
  mcpConnectionReconnectResultSchema,
  mcpConnectionResponseSchema,
  mcpConnectionsResponseSchema,
  mcpConnectionTestResponseSchema,
  memoriesListResponseSchema,
  memoryResponseSchema,
  merchantBindingResponseSchema,
  merchantBindingsResponseSchema,
  merchantConnectionResponseSchema,
  merchantUsageEventResponseSchema,
  merchantUsageEventsResponseSchema,
  merchantUsageSummaryResponseSchema,
  promptResponseSchema,
  promptsResponseSchema,
  providerModelsResponseSchema,
  providerResponseSchema,
  providersResponseSchema,
  resolveChatFunctionResponseSchema,
  sessionInputResponseSchema,
  sessionInputsResponseSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsListResponseSchema,
  sessionUsageResponseSchema,
  skillCopyResultsSchema,
  skillDetailSchema,
  skillsListResponseSchema,
  spendingLimitResponseSchema,
  stopSessionResponseSchema,
  taskResponseSchema,
  taskRunMessagesResponseSchema,
  taskRunResponseSchema,
  taskRunsListResponseSchema,
  tasksListResponseSchema,
  tenantSettingsResponseSchema,
  thinkingLevelsResponseSchema,
  toolApprovalsResponseSchema,
  usageOverviewResponseSchema,
  usageResponseSchema,
  workspaceSchema,
  workspacesListResponseSchema,
} from "./contracts/index.ts";
import { contract, type JsonSchema, operations } from "./test/contract.ts";

/**
 * The SDK model for each response schema an operation references: the
 * component name for a `$ref`, or the operation ID for an inline schema.
 */
const models: Record<string, z.ZodType> = {
  Agent: agentResponseSchema,
  AgentList: agentsResponseSchema,
  Artifact: artifactListItemSchema,
  ArtifactDownloadUrl: artifactDownloadUrlResponseSchema,
  ArtifactList: artifactsListResponseSchema,
  ChatConnection: chatConnectionSchema,
  ChatConnectionList: chatConnectionsResponseSchema,
  CreatedTask: createTaskResponseSchema,
  CreatedTaskRun: createTaskRunResponseSchema,
  LatestSessionList: latestSessionsListResponseSchema,
  McpAttachment: mcpAttachmentResponseSchema,
  McpAttachmentList: mcpAttachmentsResponseSchema,
  McpConnection: mcpConnectionResponseSchema,
  McpConnectionList: mcpConnectionsResponseSchema,
  McpConnectionReconnectResult: mcpConnectionReconnectResultSchema,
  McpConnectionTest: mcpConnectionTestResponseSchema,
  Memory: memoryResponseSchema,
  MemoryList: memoriesListResponseSchema,
  MerchantBindingList: merchantBindingsResponseSchema,
  MerchantBindingResponse: merchantBindingResponseSchema,
  MerchantConnectionResponse: merchantConnectionResponseSchema,
  MerchantUsageEventList: merchantUsageEventsResponseSchema,
  MerchantUsageEventResponse: merchantUsageEventResponseSchema,
  MerchantUsageSummary: merchantUsageSummaryResponseSchema,
  ModelSpendingLimitStatus: spendingLimitResponseSchema,
  Prompt: promptResponseSchema,
  PromptList: promptsResponseSchema,
  Provider: providerResponseSchema,
  ProviderList: providersResponseSchema,
  ProviderModelList: providerModelsResponseSchema,
  ProviderThinkingLevels: thinkingLevelsResponseSchema,
  Session: sessionResponseSchema,
  SessionList: sessionsListResponseSchema,
  SessionMessageList: sessionMessagesResponseSchema,
  SessionUsage: sessionUsageResponseSchema,
  Skill: skillDetailSchema,
  SkillCopyResultList: skillCopyResultsSchema,
  SkillList: skillsListResponseSchema,
  Task: taskResponseSchema,
  TaskList: tasksListResponseSchema,
  TaskRun: taskRunResponseSchema,
  TaskRunList: taskRunsListResponseSchema,
  TaskRunMessageList: taskRunMessagesResponseSchema,
  TenantSettings: tenantSettingsResponseSchema,
  ToolApprovalList: toolApprovalsResponseSchema,
  Usage: usageResponseSchema,
  UsageOverview: usageOverviewResponseSchema,
  Workspace: workspaceSchema,
  WorkspaceList: workspacesListResponseSchema,
  claimChatFunctionCall: claimChatFunctionResponseSchema,
  listSessionInputs: sessionInputsResponseSchema,
  resolveChatFunctionCall: resolveChatFunctionResponseSchema,
  stopSessionTurn: stopSessionResponseSchema,
  submitSessionInput: sessionInputResponseSchema,
};

/**
 * Field differences the SDK keeps on purpose, keyed by the path the walk
 * reports, with the reason. The platform sends these fields until it adopts
 * this release; delete each entry once the spec drops it.
 */
const allowedDifferences: Record<string, string> = {};

type Root = object;

function resolveRef(schema: JsonSchema, root: Root): JsonSchema {
  let current = schema;
  while (current.$ref !== undefined) {
    current = current.$ref
      .split("/")
      .slice(1)
      .reduce<unknown>(
        (node, segment) => (node as Record<string, unknown>)[segment],
        root
      ) as JsonSchema;
  }
  return current;
}

/** Resolves references, drops `null` union branches and merges `allOf`. */
function normalize(schema: JsonSchema, root: Root): JsonSchema {
  const current = resolveRef(schema, root);
  if (current.allOf !== undefined) {
    return {
      properties: Object.assign(
        {},
        ...current.allOf.map((part) => normalize(part, root).properties)
      ),
    };
  }
  const branches = (current.anyOf ?? current.oneOf)?.filter(
    (branch) => resolveRef(branch, root).type !== "null"
  );
  if (branches === undefined) {
    return current;
  }
  return branches.length === 1
    ? normalize(branches[0], root)
    : { anyOf: branches };
}

interface Side {
  root: Root;
  schema: JsonSchema;
}

/** Lists every object property one side has and the other lacks, recursively. */
function fieldDifferences(spec: Side, sdk: Side, at: string): string[] {
  const a = normalize(spec.schema, spec.root);
  const b = normalize(sdk.schema, sdk.root);
  const child = (left: JsonSchema, right: JsonSchema, path: string) =>
    fieldDifferences(
      { root: spec.root, schema: left },
      { root: sdk.root, schema: right },
      path
    );
  const differences: string[] = [];
  if (a.properties !== undefined || b.properties !== undefined) {
    const specFields = a.properties ?? {};
    const sdkFields = b.properties ?? {};
    for (const [key, value] of Object.entries(specFields)) {
      const sdkValue = sdkFields[key];
      differences.push(
        ...(sdkValue === undefined
          ? [`${at}.${key}: in the spec, missing from the SDK`]
          : child(value, sdkValue, `${at}.${key}`))
      );
    }
    for (const key of Object.keys(sdkFields)) {
      if (!(key in specFields)) {
        differences.push(`${at}.${key}: in the SDK, missing from the spec`);
      }
    }
  }
  if (a.items !== undefined && b.items !== undefined) {
    differences.push(...child(a.items, b.items, `${at}[]`));
  }
  if (
    typeof a.additionalProperties === "object" &&
    typeof b.additionalProperties === "object"
  ) {
    differences.push(
      ...child(a.additionalProperties, b.additionalProperties, `${at}{}`)
    );
  }
  if (a.anyOf !== undefined && b.anyOf !== undefined) {
    const sdkBranches = b.anyOf;
    if (a.anyOf.length === sdkBranches.length) {
      a.anyOf.forEach((branch, index) => {
        differences.push(
          ...child(branch, sdkBranches[index], `${at}|${index}`)
        );
      });
    } else {
      differences.push(
        `${at}: ${a.anyOf.length} union branches in the spec, ${sdkBranches.length} in the SDK`
      );
    }
  }
  return differences;
}

/** Each response schema an operation references, keyed as in `models`. */
const responseSchemas = new Map(
  operations.flatMap(({ operationId, responseSchema }) =>
    responseSchema === undefined
      ? []
      : [
          [
            responseSchema.$ref?.split("/").at(-1) ?? operationId,
            responseSchema,
          ] as const,
        ]
  )
);

describe("response models", () => {
  it("name an SDK model for exactly the response schemas operations reference", () => {
    expect(Object.keys(models).sort()).toStrictEqual(
      [...responseSchemas.keys()].sort()
    );
  });

  it("map every field of every response schema, recursively", () => {
    const differences = [...responseSchemas].flatMap(([name, schema]) => {
      const model = models[name];
      if (model === undefined) {
        return [];
      }
      const sdkSchema = z.toJSONSchema(model, {
        io: "input",
        unrepresentable: "any",
      });
      return fieldDifferences(
        { root: contract, schema },
        { root: sdkSchema, schema: sdkSchema as JsonSchema },
        name
      );
    });

    expect(
      differences.filter((difference) => !(difference in allowedDifferences))
    ).toStrictEqual([]);
    expect(
      Object.keys(allowedDifferences).filter(
        (difference) => !differences.includes(difference)
      )
    ).toStrictEqual([]);
  });
});
