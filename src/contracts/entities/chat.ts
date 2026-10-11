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
     * True only when every measured inference for this Turn reported
     * input/output totals. Provider omissions stay unknown — a zero is never
     * substituted for a missing measurement (ADR-0048).
     */
    measurementComplete: z.boolean(),
    modelDurationMs: z.number().int().min(0),
    metadata: z.record(z.string(), z.unknown()),
    modelId: agentModelIdSchema,
    outputTokens: z.number().int().min(0),
    reasoningTokens: z.number().int().min(0).nullable(),
    turnId: turnIdSchema,
    sessionId: z.union([sessionIdSchema, z.literal("")]),
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
    blazingAgents: z.object({ usage: usageSummarySchema }).strip(),
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
    const name = reference.slice("#/$defs/".length);
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
export const jsonSchemaShapeSchema = z.custom<ConvertibleJsonSchema>(
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
);

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
     * AI SDK owns the runtime UIMessage schema. Core keeps this wire field
     * unknown; the HTTP boundary validates it with `safeValidateUIMessages`
     * before treating it as a UIMessage.
     */
    messages: z.array(z.unknown()).min(1).optional(),
    promptId: promptIdSchema.optional(),
    variables: promptVariablesSchema.optional(),
    trigger: chatTriggerSchema.default("submit-message"),
    messageId: z.string().min(1).optional(),
    /**
     * End-user attribution (ADR-0001), stamped on the Session at lazy
     * materialization and on every usage row this Turn records.
     */
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
    /** Caller-local functions for this invocation; handlers stay in the caller's backend. */
    functions: chatFunctionDefinitionsSchema.optional(),
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
    prompt: z.string().trim().min(1).optional(),
    promptId: promptIdSchema.optional(),
    variables: promptVariablesSchema.optional(),
    output: z.discriminatedUnion("type", [
      z.object({ type: z.literal("text") }).strict(),
      z
        .object({ type: z.literal("object"), schema: jsonSchemaShapeSchema })
        .strict(),
    ]),
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
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
export type ClaimChatFunctionBody = z.infer<typeof claimChatFunctionBodySchema>;
export type ResolveChatFunctionBody = z.infer<
  typeof resolveChatFunctionBodySchema
>;
