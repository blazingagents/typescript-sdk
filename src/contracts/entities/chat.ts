import { modelMessageSchema } from "ai";
import { z } from "zod";

import {
  agentIdSchema,
  functionCallIdSchema,
  promptIdSchema,
  sessionIdSchema,
  tenantIdSchema,
  turnIdSchema,
} from "../ids.ts";
import { chatFunctionNameSchema } from "./agent-tools.ts";
import { agentModelIdSchema } from "./agents.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";
/**
 * Re-exported AI SDK types — every service, the SDK, and the dashboard
 * consume these from one place.
 */

export const chatModeSchema = z.enum(["create", "resume"]);
export const chatTriggerSchema = z.enum([
  "submit-message",
  "regenerate-message",
]);

/**
 * Per-Turn usage summary stamped into the assistant message's
 * `metadata.blazingAgents.usage` and persisted by the server. Session Turns
 * carry an `ss_` id; stateless generation uses the empty-string sentinel.
 */
export const usageSummarySchema = z
  .object({
    agentId: agentIdSchema,
    commitId: z.string().trim().min(1),
    completedAt: z.iso.datetime({ offset: true }),
    durationMs: z.number().int().min(0),
    errorMessage: z.string().nullable(),
    inputTokens: z.number().int().min(0),
    /**
     * True only when every inference reported input/output totals; a zero is
     * never substituted for a missing measurement (ADR-0048).
     */
    measurementComplete: z.boolean(),
    modelDurationMs: z.number().int().min(0),
    metadata: z.record(z.string(), z.unknown()),
    modelId: agentModelIdSchema,
    outputTokens: z.number().int().min(0),
    reasoningTokens: z.number().int().min(0).nullable(),
    turnId: turnIdSchema,
    /** Null for a stateless generation, which has no Session. */
    sessionId: sessionIdSchema.nullable(),
    stepUsages: z.array(
      z
        .object({
          inputTokens: z.number().int().min(0),
          outputTokens: z.number().int().min(0),
          reasoningTokens: z.number().int().min(0).nullable(),
          stepNumber: z.number().int().min(0),
        })
        .strip()
    ),
    startedAt: z.iso.datetime({ offset: true }),
    status: z.enum(["succeeded", "cancelled", "failed"]),
    tenantId: tenantIdSchema,
    userId: z.string(),
  })
  .strip();

export const blazingAgentsChatMessageMetadataSchema = z
  .object({
    blazingAgents: z
      .object({
        usage: usageSummarySchema,
        compactedContext: z.array(modelMessageSchema).optional(),
      })
      .strip(),
  })
  .strip();

/**
 * `variables` for the prompt-invocation path — a flat map of string→string.
 * The prompt template's derived variables are the required keys; this is
 * the wire shape only, the route layer enforces strict both-ways matching
 * against the template (missing or unknown variable → 400 invalid_request).
 */
export const promptVariablesSchema = z.record(z.string(), z.string());

type ExclusivePromptInput<Literal extends object> =
  | (Literal & {
      promptId?: never;
      variables?: never;
    })
  | (Partial<Record<keyof Literal, never>> & {
      promptId: string;
      variables?: z.infer<typeof promptVariablesSchema>;
    });

type ConvertibleJsonSchema = z.core.JSONSchema.JSONSchema;

const JSON_SCHEMA_COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf"] as const;
type JsonSchemaRecord = Record<string, unknown>;

/**
 * Checks whether the JSON Schema root contains a meaningful schema keyword.
 */
function hasMeaningfulSchemaRoot(
  value: unknown,
  definitions: JsonSchemaRecord,
  seenReferences: ReadonlySet<string>
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const schema = value as JsonSchemaRecord;
  if ("type" in schema || "properties" in schema) {
    return true;
  }
  const reference = schema.$ref;
  if (typeof reference === "string" && reference.startsWith("#/$defs/")) {
    const name = reference
      .slice("#/$defs/".length)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    if (!name || seenReferences.has(name) || !(name in definitions)) {
      return false;
    }
    return hasMeaningfulSchemaRoot(
      definitions[name],
      definitions,
      new Set([...seenReferences, name])
    );
  }
  return JSON_SCHEMA_COMPOSITION_KEYS.some((keyword) => {
    const branches = schema[keyword];
    return (
      Array.isArray(branches) &&
      branches.length > 0 &&
      branches.every((branch) =>
        hasMeaningfulSchemaRoot(branch, definitions, seenReferences)
      )
    );
  });
}

/**
 * The JSON Schema accepted by structured generation. Zod's JSON Schema
 * compiler (`z.fromJSONSchema`) is the single authority for the supported
 * feature set: anything it can convert is accepted, anything it cannot
 * (unresolvable references, unsupported keywords, …) is rejected at this
 * untrusted boundary. The only product restriction on top is the documented
 * "at least a schema root" rule, which keeps the empty match-anything schema
 * out of object mode. Composition roots are needed for schemas derived from
 * unions (for example, Pydantic's `int | None` TypeAdapter schema), and local
 * `$ref` roots are needed for recursive Pydantic models.
 */
export const jsonSchemaShapeSchema = z
  .custom<ConvertibleJsonSchema>(
    (value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
      }
      const schema = value as Record<string, unknown>;
      const rawDefinitions = schema.$defs;
      const definitions =
        typeof rawDefinitions === "object" &&
        rawDefinitions !== null &&
        !Array.isArray(rawDefinitions)
          ? (rawDefinitions as JsonSchemaRecord)
          : {};
      if (!hasMeaningfulSchemaRoot(value, definitions, new Set())) {
        return false;
      }
      try {
        z.fromJSONSchema(value as ConvertibleJsonSchema);
        return true;
      } catch {
        return false;
      }
    },
    { message: "schema contains an unsupported or invalid JSON Schema feature" }
  )
  /**
   * `z.custom` is opaque to the OpenAPI generator; declare the honest wire
   * shape (any JSON object) for the generated document.
   */
  .meta({ type: "object" });

export const MAX_CHAT_FUNCTIONS = 32;
export const MAX_CHAT_FUNCTION_DEFINITIONS_BYTES = 64 * 1024;
export const MAX_CHAT_FUNCTION_PAYLOAD_BYTES = 256 * 1024;

/**
 * Measures the UTF-8 byte length of a JSON-serialized value.
 */
export const jsonByteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** One caller-local function as sent to Blazing Agents: description and JSON Schema only. */
export const chatFunctionDefinitionSchema = z
  .object({
    description: z.string().trim().min(1),
    inputSchema: jsonSchemaShapeSchema.refine(
      (schema) => typeof schema === "object" && schema.type === "object",
      { message: "Function input schema must describe a JSON object." }
    ),
  })
  .strict();

export const chatFunctionDefinitionsSchema = z
  .record(chatFunctionNameSchema, chatFunctionDefinitionSchema)
  .refine((functions) => Object.keys(functions).length <= MAX_CHAT_FUNCTIONS, {
    message: `At most ${MAX_CHAT_FUNCTIONS} functions are allowed.`,
  })
  .refine(
    (functions) =>
      jsonByteLength(functions) <= MAX_CHAT_FUNCTION_DEFINITIONS_BYTES,
    {
      message: `Function definitions must not exceed ${MAX_CHAT_FUNCTION_DEFINITIONS_BYTES} bytes.`,
    }
  );

/**
 * Transient UI data part that authorizes one claim attempt for a function
 * call. The SDK consumes it and never forwards it to the browser.
 */
export const chatFunctionCallEventSchema = z
  .object({
    type: z.literal("data-ba-function-call"),
    data: z
      .object({
        id: functionCallIdSchema,
        name: chatFunctionNameSchema,
        input: z.json(),
        deadlineAt: z.iso.datetime({ offset: true }),
      })
      .strip(),
    transient: z.literal(true),
  })
  .strip();

export const chatFunctionOutcomeSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("output"), value: z.json() }).strict(),
    z
      .object({
        kind: z.literal("error"),
        message: z.string().min(1).max(4096),
      })
      .strict(),
  ])
  .refine(
    (outcome) => jsonByteLength(outcome) <= MAX_CHAT_FUNCTION_PAYLOAD_BYTES,
    {
      message: `Function outcome must not exceed ${MAX_CHAT_FUNCTION_PAYLOAD_BYTES} bytes.`,
    }
  );

/** `POST .../function-calls/{functionCallId}/claim` body. */
export const claimChatFunctionBodySchema = z
  .object({ claimRequestId: z.uuid() })
  .strict();

export const claimChatFunctionResponseSchema = z
  .object({ claimed: z.literal(true) })
  .strip();

/** `POST .../function-calls/{functionCallId}/result` body. */
export const resolveChatFunctionBodySchema = z
  .object({ claimRequestId: z.uuid(), outcome: chatFunctionOutcomeSchema })
  .strict();

export const resolveChatFunctionResponseSchema = z
  .object({ accepted: z.literal(true) })
  .strip();

/**
 * `POST /v1/agents/{agentId}/sessions` (create) and
 * `POST /v1/agents/{agentId}/sessions/{sessionId}` (resume) request body.
 * The URL selects the mode; on create the platform mints the `ss_` id and
 * returns it in `Location`. Exactly one of `messages` or `promptId` is
 * required, and `variables` requires `promptId`. Regenerate is resume-only,
 * enforced by the route layer rather than this schema.
 */
export const chatRequestBodySchema = z
  .object({
    /**
     * AI SDK owns the UIMessage schema; the HTTP boundary validates this with
     * `safeValidateUIMessages`.
     */
    messages: z
      .array(z.unknown())
      .min(1)
      .optional()
      .describe(
        'Ordered messages for one Turn, each an AI SDK `UIMessage` with `role: "user"`, an `id`, and non-empty `parts`. Parts can be text, or `file` parts with an `image/*` media type and a base64 `data:` URL. Send either `messages` or `promptId`.'
      ),
    promptId: promptIdSchema
      .optional()
      .describe("ID of a saved prompt to send instead of `messages`."),
    variables: promptVariablesSchema
      .optional()
      .describe(
        "Values for the saved prompt's variables. Allowed only with `promptId`, and must name exactly the prompt's variables."
      ),
    trigger: chatTriggerSchema
      .default("submit-message")
      .describe(
        "`submit-message` (the default) sends a new message. `regenerate-message` generates the answer again and is allowed only when continuing a session."
      ),
    messageId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "With `regenerate-message`, the message to cut the conversation back to before the answer is generated again."
      ),
    /**
     * Stamps the session row at lazy materialization and every
     * `token_usage_*` row this turn records (ADR-0001).
     */
    userId: userIdSchema
      .default("")
      .describe(
        "Your end user's ID. Starting a session records it on the session, and every turn in that session keeps the session's end user."
      ),
    metadata: metadataSchema
      .default({})
      .describe(
        "Your own key-value data. Recorded on a new session and on the turn's usage."
      ),
    /**
     * `chatFunctionDefinitionsSchema` validates the value; `z.custom` is opaque
     * to the OpenAPI generator, so `meta` declares the wire shape.
     */
    functions: z
      .custom<ChatFunctionDefinitions>(
        (value) => typeof value === "object" && value !== null
      )
      .check((context) => {
        const result = chatFunctionDefinitionsSchema.safeParse(context.value);
        if (!result.success) {
          context.issues.push({
            code: "custom",
            input: context.value,
            message: z.prettifyError(result.error),
          });
        }
      })
      .optional()
      .meta({
        additionalProperties: {
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            inputSchema: { type: "object" },
          },
          required: ["description", "inputSchema"],
          type: "object",
        },
        type: "object",
      })
      .describe(
        "Caller-local functions the model may call during this turn, keyed by name; each entry has a `description` and a JSON Schema `inputSchema`. Your backend claims and answers each call through the function-call endpoints."
      ),
  })
  .strict()
  .refine(
    (
      body
    ): body is typeof body & ExclusivePromptInput<{ messages: unknown[] }> =>
      body.messages === undefined
        ? body.promptId !== undefined
        : body.promptId === undefined && body.variables === undefined,
    {
      message:
        "Provide either `messages` or `promptId` (+`variables`); they are mutually exclusive, and `variables` is only allowed with `promptId`.",
      path: ["messages"],
    }
  );

/**
 * `POST /v1/agents/{agentId}/generation` — the single stateless generation
 * boundary. Output selection is explicit on the wire while prompt selection
 * remains the existing exclusive literal-or-stored-Prompt choice.
 */
export const generationRequestBodySchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("The prompt to answer. Send either `prompt` or `promptId`."),
    promptId: promptIdSchema
      .optional()
      .describe("ID of a saved prompt to use instead of `prompt`."),
    variables: promptVariablesSchema
      .optional()
      .describe(
        "Values for the saved prompt's variables. Allowed only with `promptId`, and must name exactly the prompt's variables."
      ),
    output: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("text") }).strict(),
        z
          .object({ type: z.literal("object"), schema: jsonSchemaShapeSchema })
          .strict(),
      ])
      .describe(
        'What to stream back: `{"type":"text"}` for text, or `{"type":"object","schema":{…}}` for JSON that matches a JSON Schema.'
      ),
    userId: userIdSchema
      .default("")
      .describe("Your end user's ID, used for usage attribution."),
    metadata: metadataSchema
      .default({})
      .describe("Your own key-value data, recorded with the usage."),
  })
  .strict()
  .refine(
    (body): body is typeof body & ExclusivePromptInput<{ prompt: string }> =>
      body.prompt === undefined
        ? body.promptId !== undefined
        : body.promptId === undefined && body.variables === undefined,
    {
      message:
        "Provide either `prompt` or `promptId` (+`variables`); they are mutually exclusive, and `variables` is only allowed with `promptId`.",
      path: ["prompt"],
    }
  );
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type BlazingAgentsChatMessageMetadata = z.infer<
  typeof blazingAgentsChatMessageMetadataSchema
>;
export type PromptVariables = z.infer<typeof promptVariablesSchema>;
export type ChatFunctionDefinition = z.infer<
  typeof chatFunctionDefinitionSchema
>;
export type ChatFunctionDefinitions = z.infer<
  typeof chatFunctionDefinitionsSchema
>;
export type ChatFunctionCallEvent = z.infer<typeof chatFunctionCallEventSchema>;
export type ChatFunctionOutcome = z.infer<typeof chatFunctionOutcomeSchema>;
export type ChatRequestBody = z.input<typeof chatRequestBodySchema>;
export type GenerationRequestBody = z.input<typeof generationRequestBodySchema>;
export type ClaimChatFunctionBody = z.infer<typeof claimChatFunctionBodySchema>;
export type ResolveChatFunctionBody = z.infer<
  typeof resolveChatFunctionBodySchema
>;
