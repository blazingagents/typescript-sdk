import { z } from "zod";
import { promptIdSchema, tenantIdSchema } from "../ids.ts";
import {
  MAX_PROMPT_NAME_LENGTH,
  MAX_PROMPT_TEMPLATE_BYTES,
  MAX_PROMPT_VARIABLES,
} from "../limitations.ts";
import { atLeastOneFieldMessage, hasObjectKeys } from "../utils.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

export interface PromptVariableParseResult {
  invalidVariableNames: string[];
  variables: string[];
}

export const promptVariableTokenPattern = /{{([\s\S]*?)}}/g;
export const promptVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const promptNameSchema = z.string().trim().min(1).max(MAX_PROMPT_NAME_LENGTH);

export function parsePromptVariables(
  template: string
): PromptVariableParseResult {
  const invalidVariableNames: string[] = [];
  const seenVariables = new Set<string>();
  const variables: string[] = [];

  for (const match of template.matchAll(promptVariableTokenPattern)) {
    const variableName = match[1].trim();

    if (!promptVariableNamePattern.test(variableName)) {
      invalidVariableNames.push(variableName);
      continue;
    }

    if (!seenVariables.has(variableName)) {
      seenVariables.add(variableName);
      variables.push(variableName);
    }
  }

  return { invalidVariableNames, variables };
}

export const promptTemplateSchema = z
  .string()
  .trim()
  .min(1, { message: "Prompt template is required." })
  .max(MAX_PROMPT_TEMPLATE_BYTES, {
    message: `Prompt template must be at most ${MAX_PROMPT_TEMPLATE_BYTES} bytes.`,
  })
  .superRefine((template, ctx) => {
    const { invalidVariableNames, variables } = parsePromptVariables(template);

    if (invalidVariableNames.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Prompt variables must match [A-Za-z_][A-Za-z0-9_]*.",
      });
    }

    if (variables.length > MAX_PROMPT_VARIABLES) {
      ctx.addIssue({
        code: "custom",
        message: `Prompts can include at most ${MAX_PROMPT_VARIABLES} variables.`,
      });
    }
  });

export const promptSchema = z
  .object({
    id: promptIdSchema,
    tenantId: tenantIdSchema,
    name: promptNameSchema,
    template: promptTemplateSchema,
    variables: z.array(z.string().min(1)),
    userId: userIdSchema,
    metadata: metadataSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const promptsResponseSchema = z
  .object({
    prompts: z.array(promptSchema),
  })
  .strict();

export const promptResponseSchema = promptSchema;

export const createPromptBodySchema = z
  .object({
    name: promptNameSchema,
    template: promptTemplateSchema,
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
  })
  .strict();

export const updatePromptBodySchema = z
  .object({
    name: promptNameSchema.optional(),
    template: promptTemplateSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

export function renderPromptTemplate(
  template: string,
  values: Record<string, string>
) {
  return promptTemplateSchema
    .parse(template)
    .replace(promptVariableTokenPattern, (_token, rawVariableName: string) => {
      const variableName = rawVariableName.trim();
      const value = values[variableName];

      if (typeof value !== "string") {
        throw new Error(`Missing prompt variable value: ${variableName}`);
      }

      return value;
    });
}

export type Prompt = z.infer<typeof promptSchema>;
export type PromptsResponse = z.infer<typeof promptsResponseSchema>;
export type PromptResponse = z.infer<typeof promptResponseSchema>;
export type CreatePromptBody = z.input<typeof createPromptBodySchema>;
export type UpdatePromptBody = z.infer<typeof updatePromptBodySchema>;
