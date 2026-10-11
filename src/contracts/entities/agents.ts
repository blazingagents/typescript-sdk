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
  DEFAULT_AGENTS_LIST_LIMIT,
  MAX_AGENT_INSTRUCTIONS_LENGTH,
  MAX_AGENT_NAME_LENGTH,
  MAX_AGENTS_LIST_LIMIT,
  MAX_MCP_CONNECTIONS_PER_AGENT,
} from "../limitations.ts";
import {
  atLeastOneFieldMessage,
  hasObjectKeys,
  hasUniqueValues,
} from "../utils.ts";
import { approvalPolicySchema } from "./agent-approval.ts";
import { agentToolGroupIds } from "./agent-tools.ts";
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
  .array(z.enum(agentToolGroupIds))
  .refine(hasUniqueValues, {
    message: "Tool group ids must be unique.",
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
    cursor: cursorSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_AGENTS_LIST_LIMIT)
      .default(DEFAULT_AGENTS_LIST_LIMIT),
    userId: userIdSchema.optional(),
    workspaceId: workspaceIdSchema.optional(),
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

export const createAgentBodySchema = z
  .object({
    ...approvalFields,
    name: agentNameSchema,
    model: agentModelIdSchema.nullable().default(null),
    thinkingLevel: z.string().min(1).nullable().default(null),
    providerId: providerIdSchema.nullable().default(null),
    workspaceId: workspaceIdSchema.optional(),
    workspaceTier: workspaceTierSchema.optional(),
    autoCompaction: z.boolean().default(true),
    compactionReserveTokens:
      agentResponseSchema.shape.compactionReserveTokens.default(16_384),
    memoryInjectionEnabled: z.boolean().default(false),
    tools: agentToolsSchema.default([]),
    instructions: agentInstructionsSchema.default(""),
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
    mcpConnectionIds: agentMcpConnectionIdsSchema.default([]),
  })
  .strict()
  .refine(
    (input) =>
      input.workspaceId === undefined || input.workspaceTier === undefined,
    {
      message: "workspaceId and workspaceTier are mutually exclusive.",
      path: ["workspaceTier"],
    }
  )
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

export const updateAgentBodySchema = z
  .object({
    approvalInChat: approvalPolicySchema.optional(),
    approvalInTasks: approvalPolicySchema.optional(),
    name: agentNameSchema.optional(),
    model: agentModelIdSchema.nullable().optional(),
    thinkingLevel: z.string().min(1).nullable().optional(),
    providerId: providerIdSchema.nullable().optional(),
    workspaceId: workspaceIdSchema.optional(),
    autoCompaction: z.boolean().optional(),
    compactionReserveTokens:
      agentResponseSchema.shape.compactionReserveTokens.optional(),
    memoryInjectionEnabled: z.boolean().optional(),
    tools: agentToolsSchema.optional(),
    instructions: agentInstructionsSchema.optional(),
    metadata: metadataSchema.optional(),
    mcpConnectionIds: agentMcpConnectionIdsSchema.optional(),
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
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type CreateAgentBody = z.input<typeof createAgentBodySchema>;
export type UpdateAgentBody = z.input<typeof updateAgentBodySchema>;
