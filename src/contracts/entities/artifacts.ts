import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
import {
  agentIdSchema,
  artifactIdSchema,
  sessionIdSchema,
  tenantIdSchema,
} from "../ids.ts";
import { MAX_ARTIFACT_BYTES } from "../limitations.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

export const artifactFilenameSchema = z
  .string()
  .min(1)
  .refine((filename) => filename.trim().length > 0)
  .refine((filename) => filename !== "." && filename !== "..")
  .refine((filename) => !(filename.includes("/") || filename.includes("\\")));

/**
 * Public metadata returned by Tenant-level Artifact resources.
 */
export const artifactListItemSchema = z
  .object({
    artifactId: artifactIdSchema,
    agentId: agentIdSchema,
    tenantId: tenantIdSchema,
    sessionId: sessionIdSchema,
    filename: artifactFilenameSchema,
    mediaType: z.string().trim().min(1),
    sizeBytes: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
    userId: userIdSchema,
    metadata: metadataSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const artifactsListResponseSchema = paginatedResponseSchema(
  artifactListItemSchema
);

export const artifactDownloadUrlResponseSchema = z
  .object({
    url: z.url(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export type ArtifactListItem = z.infer<typeof artifactListItemSchema>;
export type ArtifactsListResponse = z.infer<typeof artifactsListResponseSchema>;
export type ArtifactDownloadUrlResponse = z.infer<
  typeof artifactDownloadUrlResponseSchema
>;
