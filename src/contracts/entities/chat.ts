import { z } from "zod";

import {
  agentIdSchema,
  promptIdSchema,
  sessionIdSchema,
  tenantIdSchema,
  turnIdSchema,
} from "../ids.ts";
import { agentModelIdSchema, agentVersionNumberSchema } from "./agents.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";

/**
 * Re-exported AI SDK types — every service, the SDK, and the dashboard
 * consume these from one place.
 */
export type { UIMessage, UIMessageChunk } from "ai";

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
    agentVersion: agentVersionNumberSchema,
    commitId: z.string().trim().min(1),
    completedAt: z.iso.datetime({ offset: true }),
    durationMs: z.number().int().min(0),
    errorMessage: z.string().nullable(),
    inputTokens: z.number().int().min(0),
    modelDurationMs: z.number().int().min(0),
    metadata: z.record(z.string(), z.unknown()),
    modelId: agentModelIdSchema,
    outputTokens: z.number().int().min(0),
    turnId: turnIdSchema,
    sessionId: z.union([sessionIdSchema, z.literal("")]),
    stepUsages: z.array(
      z
        .object({
          inputTokens: z.number().int().min(0),
          outputTokens: z.number().int().min(0),
          stepNumber: z.number().int().min(0),
        })
        .strict()
    ),
    startedAt: z.iso.datetime({ offset: true }),
    status: z.enum(["succeeded", "cancelled", "failed"]),
    tenantId: tenantIdSchema,
    userId: z.string(),
  })
  .strict();

export const blazingAgentsChatMessageMetadataSchema = z
  .object({
    blazingAgents: z.object({ usage: usageSummarySchema }).strict(),
  })
  .strict();

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

/**
 * `POST /v1/agents/{agentId}/sessions` (create) and
 * `POST /v1/agents/{agentId}/sessions/{sessionId}` (resume) request body.
 * The platform mints the `ss_` session id on the create path and returns
 * it via the `Location` header; the URL presence (no id → create, id
 * present → resume) is the mode — there is no `id` or `mode` field here.
 * `message` is the literal input; the prompt-invocation alternative
 * (`promptId` + `variables`) is mutually exclusive with `message` — both
 * present or neither → 400 invalid_request. `variables` is only allowed
 * on the prompt-invocation path: a request carrying both `message` and
 * `variables` (without `promptId`) is a mixed shape and is rejected
 * (strict both ways). The route layer resolves the prompt template,
 * renders, and substitutes a server-constructed user `UIMessage` with a
 * single text part carrying the rendered string. `trigger` /
 * `messageId` are turn-level concerns (regenerate rides on the resume
 * route only — enforced by the route layer, not the schema).
 */
export const chatRequestBodySchema = z
  .object({
    /**
     * AI SDK owns the runtime UIMessage schema. Core keeps this wire field
     * unknown; the HTTP boundary validates it with `safeValidateUIMessages`
     * before treating it as a UIMessage.
     */
    message: z.unknown().optional(),
    promptId: promptIdSchema.optional(),
    variables: promptVariablesSchema.optional(),
    trigger: chatTriggerSchema.default("submit-message"),
    messageId: z.string().min(1).optional(),
    version: agentVersionNumberSchema.optional(),
    /**
     * End-user attribution for the session + this turn's usage
     * (ADR-0001). `userId` is opaque text (`''` = tenant-level); it stamps
     * the session row at lazy materialization (create path) and every
     * `token_usage_*` row this turn records. `metadata` is a mutable jsonb
     * object carried onto the same rows. Both default to tenant-level.
     */
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
  })
  .strict()
  .refine(
    (
      body
    ): body is typeof body &
      ExclusivePromptInput<{ message: null | NonNullable<unknown> }> =>
      body.message === undefined
        ? body.promptId !== undefined
        : body.promptId === undefined && body.variables === undefined,
    {
      message:
        "Provide either `message` or `promptId` (+`variables`); they are mutually exclusive, and `variables` is only allowed with `promptId`.",
      path: ["message"],
    }
  );

type ConvertibleJsonSchema = z.core.JSONSchema.JSONSchema;

const JSON_SCHEMA_COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf"] as const;
type JsonSchemaRecord = Record<string, unknown>;

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
    version: agentVersionNumberSchema.optional(),
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

/**
 * Mid-stream error chunk — the AI SDK native `{ type: 'error', errorText }`
 * shape (docs/adr/0003-ai-sdk-native-wire-protocol.md). `errorText` is a plain string:
 * safe human-readable prose produced by our server-side `onError` mapping —
 * no JSON stuffed in the string, no client-side parsing. `useChat` routes it
 * to `onError`, never into the transcript.
 */
export const chatStreamErrorChunkSchema = z
  .object({
    type: z.literal("error"),
    errorText: z.string(),
  })
  .strict();

export type ChatMode = z.infer<typeof chatModeSchema>;
export type ChatTrigger = z.infer<typeof chatTriggerSchema>;
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type BlazingAgentsChatMessageMetadata = z.infer<
  typeof blazingAgentsChatMessageMetadataSchema
>;
export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
export type GenerationRequestBody = z.infer<typeof generationRequestBodySchema>;
export type ChatStreamErrorChunk = z.infer<typeof chatStreamErrorChunkSchema>;
export type PromptVariables = z.infer<typeof promptVariablesSchema>;
