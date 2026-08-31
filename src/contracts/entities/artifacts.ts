import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
import {
  agentIdSchema,
  artifactIdSchema,
  sessionIdSchema,
  tenantIdSchema,
} from "../ids.ts";
import {
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_PUBLICATIONS_PER_CALL,
} from "../limitations.ts";
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
  .strict();

export const artifactsListResponseSchema = paginatedResponseSchema(
  artifactListItemSchema
);

export const artifactsListQuerySchema = z
  .object({
    agentId: agentIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    cursor: z.string().nullable().optional(),
  })
  .strict();

export const publishArtifactsInputSchema = z
  .object({
    paths: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_ARTIFACT_PUBLICATIONS_PER_CALL),
  })
  .strict();

export const publishArtifactResultSchema = z.union([
  z
    .object({
      artifactId: artifactIdSchema,
      path: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      error: z.literal(true),
      message: z.string().trim().min(1),
      path: z.string().trim().min(1),
    })
    .strict(),
]);

export const publishArtifactsOutputSchema = z
  .object({
    results: z.array(publishArtifactResultSchema).min(1),
  })
  .strict();

export const artifactDownloadUrlResponseSchema = z
  .object({
    url: z.url(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ArtifactListItem = z.infer<typeof artifactListItemSchema>;
export type ArtifactsListResponse = z.infer<typeof artifactsListResponseSchema>;
export type ArtifactsListQuery = z.infer<typeof artifactsListQuerySchema>;
export type PublishArtifactsInput = z.infer<typeof publishArtifactsInputSchema>;
export type PublishArtifactResult = z.infer<typeof publishArtifactResultSchema>;
export type PublishArtifactsOutput = z.infer<
  typeof publishArtifactsOutputSchema
>;
export type ArtifactDownloadUrlResponse = z.infer<
  typeof artifactDownloadUrlResponseSchema
>;
