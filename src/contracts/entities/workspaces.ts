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

const networkPolicyDescription =
  "Which hosts the workspace can reach: `unrestricted`, `allowlist` with `allowedHosts`, or `offline`.";

export const createWorkspaceBodySchema = z
  .object({
    tier: workspaceTierSchema
      .default("core")
      .describe(
        "Workspace tier, fixed at creation. Core loses its files when the workspace stops; Plus keeps them when it stops while idle."
      ),
    name: workspaceNameSchema
      .optional()
      .describe(
        `Display name, up to ${MAX_WORKSPACE_NAME_LENGTH} characters. Leave it out for an unnamed workspace.`
      ),
    userId: userIdSchema
      .default("")
      .describe(
        'Your own ID for the end user who owns the workspace. `""` means a tenant-level workspace. It cannot be changed later.'
      ),
    metadata: metadataSchema
      .default({})
      .describe("Your own key-value data, returned as sent."),
    networkPolicy: workspaceNetworkPolicySchema
      .default({ mode: "unrestricted" })
      .describe(networkPolicyDescription),
  })
  .strict();

export const updateWorkspaceBodySchema = z
  .object({
    name: workspaceNameSchema
      .nullable()
      .optional()
      .describe(
        `New display name, up to ${MAX_WORKSPACE_NAME_LENGTH} characters, or \`null\` to clear it.`
      ),
    metadata: metadataSchema
      .optional()
      .describe("Replaces the workspace's metadata."),
    networkPolicy: workspaceNetworkPolicySchema
      .optional()
      .describe(`Replaces the network policy. ${networkPolicyDescription}`),
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
