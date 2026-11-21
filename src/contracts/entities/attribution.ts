import { z } from "zod";
import { MAX_METADATA_BYTES } from "../limitations.ts";

/**
 * End-user attribution — the uniform ownership dimension on every
 * tenant-owned product resource (ADR-0001). `userId` is an opaque
 * tenant-chosen string (`''` = tenant-level, immutable after creation);
 * `metadata` is a mutable jsonb object. Neither is ever on tenant config
 * (apikeys, providers).
 *
 * These are the shared zod primitives every attributed entity reuses so the
 * two fields stay shape-identical across agents, Workspaces, prompts,
 * sessions, tasks, task runs, artifacts, and usage rows.
 */
export const userIdSchema = z.string();

export const metadataSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (metadata) =>
      new TextEncoder().encode(JSON.stringify(metadata)).length <=
      MAX_METADATA_BYTES,
    { message: "Metadata must be at most 128 KiB as JSON." }
  );

/**
 * The create-body shape for an attributed resource: both fields optional
 * with tenant-level defaults (`userId: ''`, `metadata: {}`). `userId` is
 * set at creation and immutable — update bodies accept `metadata` only
 * (they do not include `userId`, so a `userId` in an update body is rejected
 * by the update body's `.strict()`).
 */
export const attributionCreateInputSchema = z
  .object({
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
  })
  .strict();
