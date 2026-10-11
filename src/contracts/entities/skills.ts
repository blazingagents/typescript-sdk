import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
import { agentIdSchema, skillIdSchema, tenantIdSchema } from "../ids.ts";
import {
  MAX_SKILL_COPY_DESTINATIONS,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_SKILL_NAME_LENGTH,
} from "../limitations.ts";
import { hasUniqueValues } from "../utils.ts";

export const skillNameSchema = z
  .string()
  .min(1, { message: "Name is required." })
  .max(MAX_SKILL_NAME_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      "Name must use lowercase letters, numbers, and single internal hyphens.",
  })
  .refine((name) => name !== "anthropic" && name !== "claude", {
    message: "Name is reserved.",
  });

export const skillDescriptionSchema = z
  .string()
  .trim()
  .min(1, { message: "Description is required." })
  .max(MAX_SKILL_DESCRIPTION_LENGTH);

export const skillMetadataSchema = z.record(z.string(), z.string());

export const skillSchema = z
  .object({
    id: skillIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    name: skillNameSchema,
    description: skillDescriptionSchema,
    metadata: skillMetadataSchema.optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const skillFilePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) => {
      if (path.startsWith("/") || path.includes("\0")) {
        return false;
      }
      const segments = path.split("/");
      return segments.every(
        (segment) => segment.length > 0 && segment !== "." && segment !== ".."
      );
    },
    { message: "Path must be a safe relative file path." }
  );

export const skillFileSchema = z
  .object({
    path: skillFilePathSchema,
    sizeBytes: z.number().int().nonnegative(),
  })
  .strip();

export const skillDetailSchema = skillSchema
  .extend({
    files: z.array(skillFileSchema),
  })
  .strip();

export const skillsListResponseSchema = paginatedResponseSchema(skillSchema);

export const createSkillBodySchema = z
  .object({
    path: z.literal("SKILL.md"),
    content: z.string(),
  })
  .strict();

export const skillArchiveTypeSchema = z.enum(["zip", "tar", "tar.gz"]);

export const copySkillBodySchema = z
  .object({
    agentIds: z
      .array(agentIdSchema)
      .min(1)
      .max(MAX_SKILL_COPY_DESTINATIONS)
      .refine(hasUniqueValues, {
        message: "Destination Agent ids must be unique.",
      }),
  })
  .strict();

const skillCopyCreatedResultSchema = z
  .object({
    agentId: agentIdSchema,
    status: z.literal("created"),
    skill: skillDetailSchema,
  })
  .strip();

const skillCopyFailedResultSchema = z
  .object({
    agentId: agentIdSchema,
    status: z.literal("failed"),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.unknown().optional(),
      })
      .strip(),
  })
  .strip();

export const skillCopyResultSchema = z.discriminatedUnion("status", [
  skillCopyCreatedResultSchema,
  skillCopyFailedResultSchema,
]);

export const skillCopyResultsSchema = z.array(skillCopyResultSchema);

export type Skill = z.infer<typeof skillSchema>;
export type SkillDetail = z.infer<typeof skillDetailSchema>;
export type SkillFile = z.infer<typeof skillFileSchema>;
export type SkillsListResponse = z.infer<typeof skillsListResponseSchema>;
export type CreateSkillBody = z.infer<typeof createSkillBodySchema>;
export type SkillArchiveType = z.infer<typeof skillArchiveTypeSchema>;
export type SkillCopyResult = z.infer<typeof skillCopyResultSchema>;
export type SkillCopyResults = z.infer<typeof skillCopyResultsSchema>;
