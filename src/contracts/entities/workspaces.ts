import { z } from "zod";
import { cursorSchema, paginatedResponseSchema } from "../api.ts";
import { tenantIdSchema, workspaceIdSchema } from "../ids.ts";
import {
  DEFAULT_WORKSPACES_LIST_LIMIT,
  MAX_WORKSPACE_NAME_LENGTH,
  MAX_WORKSPACES_LIST_LIMIT,
} from "../limitations.ts";
import { hasObjectKeys } from "../utils.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_WORKSPACE_NAME_LENGTH);

export const workspaceBackupSchema = z
  .object({
    dir: z.literal("/workspace"),
    id: z.uuid(),
    localBucket: z.boolean().optional(),
  })
  .strict();

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

export const workspaceSchema = z
  .object({
    id: workspaceIdSchema,
    tenantId: tenantIdSchema,
    name: workspaceNameSchema.nullable(),
    userId: userIdSchema,
    metadata: metadataSchema,
    networkPolicy: workspaceNetworkPolicySchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const createWorkspaceBodySchema = z
  .object({
    name: workspaceNameSchema.optional(),
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

export const workspaceListQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_WORKSPACES_LIST_LIMIT)
      .default(DEFAULT_WORKSPACES_LIST_LIMIT),
    userId: userIdSchema.optional(),
  })
  .strict();

export const workspacesListResponseSchema =
  paginatedResponseSchema(workspaceSchema);

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceBackup = z.infer<typeof workspaceBackupSchema>;
export type WorkspaceNetworkPolicy = z.infer<
  typeof workspaceNetworkPolicySchema
>;
export type CreateWorkspaceBody = z.input<typeof createWorkspaceBodySchema>;
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;
export type WorkspaceListQuery = z.infer<typeof workspaceListQuerySchema>;
export type WorkspacesListResponse = z.infer<
  typeof workspacesListResponseSchema
>;
