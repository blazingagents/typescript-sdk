import { z } from "zod";
import { cursorSchema, paginatedResponseSchema } from "../api.ts";
import { agentIdSchema, promptIdSchema, tenantIdSchema } from "../ids.ts";
import {
  DEFAULT_RESOURCES_LIST_LIMIT,
  MAX_PROMPT_NAME_LENGTH,
  MAX_PROMPT_TEMPLATE_BYTES,
  MAX_PROMPT_VARIABLES,
  MAX_RESOURCES_LIST_LIMIT,
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

/**
 * Lists unique valid Prompt variables in appearance order and reports invalid names.
 * @param template - Prompt template containing double-brace variable tokens.
 * @returns Unique valid variables and all invalid variable names.
 */
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

export const promptResponseSchema = z
  .object({
    id: promptIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema.nullable(),
    name: promptNameSchema,
    template: promptTemplateSchema,
    variables: z.array(z.string().min(1)),
    userId: userIdSchema,
    metadata: metadataSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const promptsResponseSchema =
  paginatedResponseSchema(promptResponseSchema);
const promptFieldDescriptions = {
  name: "Display name, 1 to 80 characters.",
  template:
    "Message template, up to 10,240 characters. Mark each variable as `{{name}}`; names match `[A-Za-z_][A-Za-z0-9_]*`, and a template can use up to 10 of them.",
  agentId:
    "ID of an agent in your tenant to link the prompt to, or `null` for no link. Deleting the agent also deletes its linked prompts.",
  metadata: "Your own key-value data, returned unchanged.",
} as const;

export const promptsListQuerySchema = z
  .object({
    userId: userIdSchema
      .optional()
      .describe(
        "Return only prompts for this end user. Send an empty string for tenant-level prompts, or leave it out for all prompts."
      ),
    agentId: agentIdSchema
      .optional()
      .describe("Return only prompts linked to this agent."),
    cursor: cursorSchema
      .optional()
      .describe("`nextCursor` from the previous page."),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RESOURCES_LIST_LIMIT)
      .default(DEFAULT_RESOURCES_LIST_LIMIT)
      .describe("Maximum number of prompts to return."),
  })
  .strict();

export const createPromptBodySchema = z
  .object({
    name: promptNameSchema.describe(promptFieldDescriptions.name),
    template: promptTemplateSchema.describe(promptFieldDescriptions.template),
    agentId: agentIdSchema
      .nullable()
      .optional()
      .describe(promptFieldDescriptions.agentId),
    userId: userIdSchema
      .default("")
      .describe(
        "Your end user's ID, used for attribution. An empty string means a tenant-level prompt. It cannot change after creation."
      ),
    metadata: metadataSchema
      .default({})
      .describe(promptFieldDescriptions.metadata),
  })
  .strict();

export const updatePromptBodySchema = z
  .object({
    agentId: agentIdSchema
      .nullable()
      .optional()
      .describe(promptFieldDescriptions.agentId),
    name: promptNameSchema.optional().describe(promptFieldDescriptions.name),
    template: promptTemplateSchema
      .optional()
      .describe(promptFieldDescriptions.template),
    metadata: metadataSchema
      .optional()
      .describe(
        `${promptFieldDescriptions.metadata} Replaces the current value.`
      ),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

/**
 * Validates the Prompt template and replaces variables with their supplied string values.
 * @param template - Prompt template containing double-brace variable tokens.
 * @param values - Values to inspect or substitute.
 * @returns The validated template with every variable replaced.
 * @throws ZodError - If the template is invalid.
 * @throws Error - If a variable has no string value.
 */
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
export type PromptsResponse = z.infer<typeof promptsResponseSchema>;
export type PromptsListQuery = z.infer<typeof promptsListQuerySchema>;
export type PromptResponse = z.infer<typeof promptResponseSchema>;
export type CreatePromptBody = z.input<typeof createPromptBodySchema>;
export type UpdatePromptBody = z.infer<typeof updatePromptBodySchema>;
