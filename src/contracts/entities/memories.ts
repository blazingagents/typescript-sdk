import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
import { agentIdSchema, memoryIdSchema, tenantIdSchema } from "../ids.ts";
import { MAX_MEMORY_TEXT_BYTES } from "../limitations.ts";
import { userIdSchema } from "./attribution.ts";

/**
 * Memory — a single Agent-owned text row (Agent Memories PRD). `userId` is
 * optional Attribution: `''` marks an Agent-general row, stamped at creation
 * and immutable. The record is the full tenant-facing shape; the generated
 * `searchVector` never leaves the database. Text is capped at 10 KiB
 * (bytes, not characters) here for a clean 4xx — the DB `octet_length`
 * check is the hard backstop.
 */

const textEncoder = new TextEncoder();

export const memoryTextSchema = z
  .string()
  .min(1)
  .refine((text) => textEncoder.encode(text).length <= MAX_MEMORY_TEXT_BYTES, {
    message: `Memory text must be at most ${MAX_MEMORY_TEXT_BYTES} bytes.`,
  });

export const memorySchema = z
  .object({
    id: memoryIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    userId: userIdSchema,
    text: memoryTextSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    lastAccessedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const memoryResponseSchema = z
  .object({
    memory: memorySchema,
  })
  .strip();

export const memoriesListResponseSchema = paginatedResponseSchema(memorySchema);

export const createMemoryBodySchema = z
  .object({
    text: memoryTextSchema.describe("The note to remember, up to 10 KiB."),
    userId: userIdSchema
      .default("")
      .describe(
        "The end user this memory belongs to. Only turns that pass the same `userId` see it. Leave it out or send an empty string for a general memory that every turn of the agent sees. It cannot change after creation."
      ),
  })
  .strict();

export const updateMemoryBodySchema = z
  .object({
    text: memoryTextSchema.describe(
      "Replacement text for the memory, up to 10 KiB."
    ),
  })
  .strict();
export type Memory = z.infer<typeof memorySchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
export type MemoriesListResponse = z.infer<typeof memoriesListResponseSchema>;
export type CreateMemoryBody = z.input<typeof createMemoryBodySchema>;
export type UpdateMemoryBody = z.infer<typeof updateMemoryBodySchema>;
