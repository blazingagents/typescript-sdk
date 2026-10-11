import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
import { tenantIdSchema, workspaceIdSchema } from "../ids.ts";
import { MAX_WORKSPACE_NAME_LENGTH } from "../limitations.ts";
import { hasObjectKeys } from "../utils.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_WORKSPACE_NAME_LENGTH);

export const workspaceTierSchema = z.enum(["core", "plus"]);

export const workspaceNetworkPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("unrestricted") }).strict(),
  z
    .object({
      allowedHosts: z.array(z.string().trim().min(1)).min(1),
      mode: z.literal("allowlist"),
    })
    .strict(),
  z.object({ mode: z.literal("offline") }).strict(),
]);

const workspaceNetworkPolicyResponseSchema = z.discriminatedUnion("mode", [
  workspaceNetworkPolicySchema.options[0].strip(),
  workspaceNetworkPolicySchema.options[1].strip(),
  workspaceNetworkPolicySchema.options[2].strip(),
]);

export const workspaceSchema = z
  .object({
    id: workspaceIdSchema,
    tenantId: tenantIdSchema,
    tier: workspaceTierSchema,
    name: workspaceNameSchema.nullable(),
    userId: userIdSchema,
    metadata: metadataSchema,
    networkPolicy: workspaceNetworkPolicyResponseSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const createWorkspaceBodySchema = z
  .object({
    name: workspaceNameSchema.optional(),
    tier: workspaceTierSchema.default("core"),
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
    networkPolicy: workspaceNetworkPolicySchema.default({
      mode: "unrestricted",
    }),
  })
  .strict();

export const updateWorkspaceBodySchema = z
  .object({
    name: workspaceNameSchema.nullable().optional(),
    metadata: metadataSchema.optional(),
    networkPolicy: workspaceNetworkPolicySchema.optional(),
  })
  .strict()
  .refine(hasObjectKeys, { message: "At least one field is required." });

export const workspacesListResponseSchema =
  paginatedResponseSchema(workspaceSchema);

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceTier = z.infer<typeof workspaceTierSchema>;
export type WorkspaceNetworkPolicy = z.infer<
  typeof workspaceNetworkPolicySchema
>;
export type CreateWorkspaceBody = z.input<typeof createWorkspaceBodySchema>;
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;
export type WorkspacesListResponse = z.infer<
  typeof workspacesListResponseSchema
>;
