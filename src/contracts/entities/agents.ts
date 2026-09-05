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
  DEFAULT_AGENT_VERSIONS_LIST_LIMIT,
  MAX_AGENT_INSTRUCTIONS_LENGTH,
  MAX_AGENT_NAME_LENGTH,
  MAX_AGENT_VERSIONS_LIST_LIMIT,
  MAX_MCP_CONNECTIONS_PER_AGENT,
} from "../limitations.ts";
import {
  atLeastOneFieldMessage,
  hasObjectKeys,
  hasUniqueValues,
} from "../utils.ts";
import { agentToolGroupIds } from "./agent-tools.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

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

export const agentVersionNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647);

export const agentStatusSchema = z.enum(["active", "disabled"]);

const providerModelPairMessage =
  "Provider and model must either both be set or both be null.";

function hasProviderModelPair(input: {
  model: string | null;
  providerId: string | null;
}): boolean {
  return (input.model === null) === (input.providerId === null);
}

export const agentSchema = z
  .object({
    id: agentIdSchema,
    tenantId: tenantIdSchema,
    name: agentNameSchema,
    model: agentModelIdSchema.nullable(),
    thinkingLevel: z.string().min(1).nullable(),
    providerId: providerIdSchema.nullable(),
    workspaceId: workspaceIdSchema,
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
    version: agentVersionNumberSchema,
    status: agentStatusSchema,
  })
  .strict()
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

export const agentsResponseSchema = z
  .object({
    agents: z.array(agentSchema),
  })
  .strict();

export const agentResponseSchema = agentSchema;

export const agentsListQuerySchema = z
  .object({
    userId: userIdSchema.optional(),
    workspaceId: workspaceIdSchema.optional(),
  })
  .strict();

export const agentVersionSchema = z
  .object({
    agentId: agentIdSchema,
    tenantId: tenantIdSchema,
    version: agentVersionNumberSchema,
    name: agentSchema.shape.name,
    model: agentSchema.shape.model,
    thinkingLevel: agentSchema.shape.thinkingLevel,
    providerId: agentSchema.shape.providerId,
    memoryInjectionEnabled: agentSchema.shape.memoryInjectionEnabled,
    tools: agentSchema.shape.tools,
    instructions: agentSchema.shape.instructions,
    metadata: agentSchema.shape.metadata,
    mcpConnectionIds: agentSchema.shape.mcpConnectionIds,
    createdAt: agentSchema.shape.createdAt,
  })
  .strict()
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

export const agentVersionsListQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_AGENT_VERSIONS_LIST_LIMIT)
      .default(DEFAULT_AGENT_VERSIONS_LIST_LIMIT),
  })
  .strict();

export const agentVersionsResponseSchema =
  paginatedResponseSchema(agentVersionSchema);

export const createAgentBodySchema = z
  .object({
    name: agentNameSchema,
    model: agentModelIdSchema.nullable().default(null),
    thinkingLevel: z.string().min(1).nullable().default(null),
    providerId: providerIdSchema.nullable().default(null),
    workspaceId: workspaceIdSchema.optional(),
    memoryInjectionEnabled: z.boolean().default(false),
    tools: agentToolsSchema.default([]),
    instructions: agentInstructionsSchema.default(""),
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
    mcpConnectionIds: agentMcpConnectionIdsSchema.default([]),
  })
  .strict()
  .refine(hasProviderModelPair, {
    message: providerModelPairMessage,
    path: ["providerId"],
  });

export const updateAgentBodySchema = z
  .object({
    name: agentNameSchema.optional(),
    model: agentModelIdSchema.nullable().optional(),
    thinkingLevel: z.string().min(1).nullable().optional(),
    providerId: providerIdSchema.nullable().optional(),
    workspaceId: workspaceIdSchema.optional(),
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

export type Agent = z.infer<typeof agentSchema>;
export type AgentsResponse = z.infer<typeof agentsResponseSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentsListQuery = z.infer<typeof agentsListQuerySchema>;
export type AgentVersion = z.infer<typeof agentVersionSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentVersionsListQuery = z.infer<
  typeof agentVersionsListQuerySchema
>;
export type AgentVersionsResponse = z.infer<typeof agentVersionsResponseSchema>;
export type CreateAgentBody = z.input<typeof createAgentBodySchema>;
export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>;
