import { z } from "zod";
import { cursorSchema, paginatedResponseSchema } from "../api.ts";
import {
  agentIdSchema,
  mcpConnectionIdSchema,
  providerIdSchema,
  tenantIdSchema,
  workspaceIdSchema,
} from "../ids.ts";
import {
  DEFAULT_RESOURCES_LIST_LIMIT,
  MAX_AGENT_INSTRUCTIONS_LENGTH,
  MAX_AGENT_NAME_LENGTH,
  MAX_MCP_CONNECTIONS_PER_AGENT,
  MAX_RESOURCES_LIST_LIMIT,
} from "../limitations.ts";
import {
  atLeastOneFieldMessage,
  hasObjectKeys,
  hasUniqueValues,
} from "../utils.ts";
import { approvalPolicySchema } from "./agent-approval.ts";
import { agentToolNames } from "./agent-tools.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";
import { workspaceTierSchema } from "./workspaces.ts";

const approvalFields = {
  approvalInChat: approvalPolicySchema.default({
    default: "full",
    overrides: [],
  }),
  approvalInTasks: approvalPolicySchema.default({
    default: "full",
    overrides: [],
  }),
};

const agentNameSchema = z.string().trim().min(1).max(MAX_AGENT_NAME_LENGTH);
export const agentInstructionsSchema = z
  .string()
  .max(MAX_AGENT_INSTRUCTIONS_LENGTH);

/** Provider-native model id, passed through without interpretation. */
export const agentModelIdSchema = z.string().trim().min(1);

export const agentToolsSchema = z
  .array(z.enum(agentToolNames))
  .refine(hasUniqueValues, {
    message: "Tool names must be unique.",
  });

export const agentMcpConnectionIdsSchema = z
  .array(mcpConnectionIdSchema)
  .max(MAX_MCP_CONNECTIONS_PER_AGENT)
  .refine(hasUniqueValues, {
    message: "MCP connection ids must be unique.",
  });

export const agentStatusSchema = z.enum(["active", "disabled"]);

const providerModelPairMessage =
  "Provider and model must either both be set or both be null.";

/**
 * Checks that provider and model selections are both present or both absent.
 */
function hasProviderModelPair(input: {
  model: string | null;
  providerId: string | null;
}): boolean {
  return (input.model === null) === (input.providerId === null);
}

export const agentResponseSchema = z
  .object({
    ...approvalFields,
    id: agentIdSchema,
    tenantId: tenantIdSchema,
    name: agentNameSchema,
    model: agentModelIdSchema.nullable(),
    thinkingLevel: z.string().min(1).nullable(),
    providerId: providerIdSchema.nullable(),
    workspaceId: workspaceIdSchema,
    autoCompaction: z.boolean(),
    compactionReserveTokens: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    memoryInjectionEnabled: z.boolean(),
    tools: agentToolsSchema,
    instructions: agentInstructionsSchema,
    userId: userIdSchema,
    metadata: metadataSchema,
    mcpConnectionIds: agentMcpConnectionIdsSchema,
    /** A short-lived signed URL for the private, platform-owned avatar. */
    avatarUrl: z.url().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    status: agentStatusSchema,
  })
  .strip()
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

export const agentsResponseSchema =
  paginatedResponseSchema(agentResponseSchema);

export const agentsListQuerySchema = z
  .object({
    userId: userIdSchema
      .optional()
      .describe(
        "Return only agents for this end user. Send an empty string for tenant-level agents, or leave it out for all agents."
      ),
    workspaceId: workspaceIdSchema
      .optional()
      .describe("Return only agents that use this workspace."),
    cursor: cursorSchema
      .optional()
      .describe("`nextCursor` from the previous page."),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RESOURCES_LIST_LIMIT)
      .default(DEFAULT_RESOURCES_LIST_LIMIT)
      .describe("Maximum number of agents to return."),
  })
  .strict();

export const agentConfigSchema = z
  .object({
    ...approvalFields,
    name: agentResponseSchema.shape.name,
    model: agentResponseSchema.shape.model,
    thinkingLevel: agentResponseSchema.shape.thinkingLevel,
    providerId: agentResponseSchema.shape.providerId,
    autoCompaction: agentResponseSchema.shape.autoCompaction,
    compactionReserveTokens: agentResponseSchema.shape.compactionReserveTokens,
    memoryInjectionEnabled: agentResponseSchema.shape.memoryInjectionEnabled,
    tools: agentResponseSchema.shape.tools,
    instructions: agentResponseSchema.shape.instructions,
    metadata: agentResponseSchema.shape.metadata,
    mcpConnectionIds: agentResponseSchema.shape.mcpConnectionIds,
  })
  .strip()
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

const agentFieldDescriptions = {
  approvalInChat:
    "Which tool calls need approval in sessions and stateless generation.",
  approvalInTasks: "Which tool calls need approval in task runs.",
  name: "Display name.",
  model:
    "The provider's own model ID, such as `openai/gpt-6-luna`. Send it together with `providerId`.",
  thinkingLevel:
    "How much reasoning to request from the model, such as `high`. Needs a provider and model, and must be a level the model supports.",
  providerId:
    "ID of the provider whose key runs the model. Send it together with `model`.",
  workspaceId: "ID of the workspace the agent reads and writes files in.",
  autoCompaction:
    "Summarize older context automatically when a conversation nears the model's context limit.",
  compactionReserveTokens:
    "Tokens to keep free for the model's reply when deciding whether to compact.",
  memoryInjectionEnabled:
    "Add the agent's saved memories to every turn automatically.",
  tools:
    "Built-in tools the agent can use. Each tool is enabled individually and is off until listed. File tools such as `read` and `bash` run in the attached workspace.",
  instructions: "Instructions the agent follows on every turn.",
  userId:
    "Your end user's ID, used for attribution. An empty string means a tenant-level agent. It cannot change after creation.",
  metadata: "Your own key-value data, returned unchanged.",
  mcpConnectionIds: "IDs of the MCP connections attached to the agent.",
} as const;

export const createAgentBodySchema = z
  .object({
    workspaceTier: workspaceTierSchema
      .optional()
      .describe(
        "Tier for a new Workspace. Defaults to Core. Cannot be combined with workspaceId."
      ),
    approvalInChat: approvalFields.approvalInChat.describe(
      agentFieldDescriptions.approvalInChat
    ),
    approvalInTasks: approvalFields.approvalInTasks.describe(
      agentFieldDescriptions.approvalInTasks
    ),
    name: agentNameSchema.describe(agentFieldDescriptions.name),
    model: agentModelIdSchema
      .nullable()
      .default(null)
      .describe(agentFieldDescriptions.model),
    thinkingLevel: z
      .string()
      .min(1)
      .nullable()
      .default(null)
      .describe(agentFieldDescriptions.thinkingLevel),
    providerId: providerIdSchema
      .nullable()
      .default(null)
      .describe(agentFieldDescriptions.providerId),
    workspaceId: workspaceIdSchema
      .optional()
      .describe(
        `${agentFieldDescriptions.workspaceId} Leave it out to create a new workspace for the agent, or send an existing one to share it.`
      ),
    autoCompaction: z
      .boolean()
      .default(true)
      .describe(agentFieldDescriptions.autoCompaction),
    compactionReserveTokens: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .default(16_384)
      .describe(agentFieldDescriptions.compactionReserveTokens),
    memoryInjectionEnabled: z
      .boolean()
      .default(false)
      .describe(agentFieldDescriptions.memoryInjectionEnabled),
    tools: agentToolsSchema.default([]).describe(agentFieldDescriptions.tools),
    instructions: agentInstructionsSchema
      .default("")
      .describe(agentFieldDescriptions.instructions),
    userId: userIdSchema.default("").describe(agentFieldDescriptions.userId),
    metadata: metadataSchema
      .default({})
      .describe(agentFieldDescriptions.metadata),
    mcpConnectionIds: agentMcpConnectionIdsSchema
      .default([])
      .describe(agentFieldDescriptions.mcpConnectionIds),
  })
  .strict()
  .refine(
    (input) =>
      input.workspaceId === undefined || input.workspaceTier === undefined,
    {
      message: "workspaceTier cannot be combined with workspaceId",
      path: ["workspaceTier"],
    }
  )
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

export const updateAgentBodySchema = z
  .object({
    approvalInChat: approvalPolicySchema
      .optional()
      .describe(agentFieldDescriptions.approvalInChat),
    approvalInTasks: approvalPolicySchema
      .optional()
      .describe(agentFieldDescriptions.approvalInTasks),
    name: agentNameSchema.optional().describe(agentFieldDescriptions.name),
    model: agentModelIdSchema
      .nullable()
      .optional()
      .describe(agentFieldDescriptions.model),
    thinkingLevel: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe(agentFieldDescriptions.thinkingLevel),
    providerId: providerIdSchema
      .nullable()
      .optional()
      .describe(agentFieldDescriptions.providerId),
    workspaceId: workspaceIdSchema
      .optional()
      .describe(agentFieldDescriptions.workspaceId),
    autoCompaction: z
      .boolean()
      .optional()
      .describe(agentFieldDescriptions.autoCompaction),
    compactionReserveTokens: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional()
      .describe(agentFieldDescriptions.compactionReserveTokens),
    memoryInjectionEnabled: z
      .boolean()
      .optional()
      .describe(agentFieldDescriptions.memoryInjectionEnabled),
    tools: agentToolsSchema.optional().describe(agentFieldDescriptions.tools),
    instructions: agentInstructionsSchema
      .optional()
      .describe(agentFieldDescriptions.instructions),
    metadata: metadataSchema
      .optional()
      .describe(agentFieldDescriptions.metadata),
    mcpConnectionIds: agentMcpConnectionIdsSchema
      .optional()
      .describe(agentFieldDescriptions.mcpConnectionIds),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  })
  .refine(
    (input) => {
      if (input.model === undefined && input.providerId === undefined) {
        return true;
      }
      if (input.providerId === undefined) {
        return input.model !== null;
      }
      if (input.model === undefined) {
        return false;
      }
      return (input.model === null) === (input.providerId === null);
    },
    {
      message: providerModelPairMessage,
      path: ["providerId"],
    }
  );

export type Agent = z.infer<typeof agentResponseSchema>;
export type AgentsResponse = z.infer<typeof agentsResponseSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentsListQuery = z.infer<typeof agentsListQuerySchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type CreateAgentBody = z.input<typeof createAgentBodySchema>;
export type UpdateAgentBody = z.input<typeof updateAgentBodySchema>;
