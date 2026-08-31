import { parseDocument } from "yaml";
import { z } from "zod";
import { cursorSchema, paginatedResponseSchema } from "../api.ts";
import { agentIdSchema, skillIdSchema, tenantIdSchema } from "../ids.ts";
import {
  DEFAULT_SKILLS_LIST_LIMIT,
  MAX_SKILL_COMPATIBILITY_LENGTH,
  MAX_SKILL_COPY_DESTINATIONS,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILLS_LIST_LIMIT,
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

export const skillFrontmatterSchema = z
  .object({
    name: skillNameSchema,
    description: skillDescriptionSchema,
    license: z.string().optional(),
    compatibility: z.string().max(MAX_SKILL_COMPATIBILITY_LENGTH).optional(),
    metadata: skillMetadataSchema.optional(),
    "allowed-tools": z.string().optional(),
  })
  .strict();

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
  .strict();

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
  .strict();

export const skillDetailSchema = skillSchema
  .extend({
    files: z.array(skillFileSchema),
  })
  .strict();

export const skillResponseSchema = skillDetailSchema;

export const skillsListQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_SKILLS_LIST_LIMIT)
      .default(DEFAULT_SKILLS_LIST_LIMIT),
  })
  .strict();

export const skillsListResponseSchema = paginatedResponseSchema(skillSchema);

export const createSkillBodySchema = z
  .object({
    path: z.literal("SKILL.md"),
    content: z.string(),
  })
  .strict();

export const skillArchiveTypeSchema = z.enum(["zip", "tar", "tar.gz"]);

export const skillUploadBodySchema = z
  .object({
    type: skillArchiveTypeSchema,
    file: z.file(),
  })
  .strict();

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
  .strict();

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
      .strict(),
  })
  .strict();

export const skillCopyResultSchema = z.discriminatedUnion("status", [
  skillCopyCreatedResultSchema,
  skillCopyFailedResultSchema,
]);

export const skillCopyResultsSchema = z.array(skillCopyResultSchema);

export interface SkillMarkdownFrontmatterParseSuccess {
  frontmatter: SkillFrontmatter;
  success: true;
}

export interface SkillMarkdownFrontmatterParseFailure {
  message: string;
  success: false;
}

export type SkillMarkdownFrontmatterParseResult =
  | SkillMarkdownFrontmatterParseSuccess
  | SkillMarkdownFrontmatterParseFailure;

const frontmatterPattern = /^---\n([\s\S]*?)\n---(?:\n|$)/;

export function parseSkillMarkdownFrontmatter(
  content: string
): SkillMarkdownFrontmatterParseResult {
  const normalized = content.replaceAll("\r\n", "\n");
  const match = frontmatterPattern.exec(normalized);

  if (!match) {
    return {
      message: "SKILL.md must start with frontmatter.",
      success: false,
    };
  }

  const document = parseDocument(match[1]);
  if (document.errors.length > 0) {
    return {
      message: `SKILL.md frontmatter is not valid YAML: ${document.errors[0].message}`,
      success: false,
    };
  }

  const result = skillFrontmatterSchema.safeParse(document.toJS());
  if (!result.success) {
    return {
      message: "SKILL.md frontmatter does not match the accepted contract.",
      success: false,
    };
  }

  return { frontmatter: result.data, success: true };
}

export type Skill = z.infer<typeof skillSchema>;
export type SkillDetail = z.infer<typeof skillDetailSchema>;
export type SkillResponse = z.infer<typeof skillResponseSchema>;
export type SkillFile = z.infer<typeof skillFileSchema>;
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
export type SkillsListQuery = z.infer<typeof skillsListQuerySchema>;
export type SkillsListResponse = z.infer<typeof skillsListResponseSchema>;
export type CreateSkillBody = z.infer<typeof createSkillBodySchema>;
export type SkillArchiveType = z.infer<typeof skillArchiveTypeSchema>;
export type SkillUploadBody = z.infer<typeof skillUploadBodySchema>;
export type CopySkillBody = z.infer<typeof copySkillBodySchema>;
export type SkillCopyResult = z.infer<typeof skillCopyResultSchema>;
export type SkillCopyResults = z.infer<typeof skillCopyResultsSchema>;
