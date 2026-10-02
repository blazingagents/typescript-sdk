import { z } from "zod";
import {
  providerIdSchema,
  providerKeyFragmentSchema,
  sessionIdSchema,
  taskRunIdSchema,
  tenantIdSchema,
} from "../ids.ts";
import { MAX_PROVIDER_NAME_LENGTH } from "../limitations.ts";

/**
 * Provider type — the enum of model providers we support. Selects catalog
 * discovery and AI SDK model behavior.
 * (docs/adr/0039-explicit-provider-model-pairs.md)
 */
export const providerTypeSchema = z.enum([
  "openai",
  "anthropic",
  "openrouter",
  "google",
  "vercel_ai_gateway",
  "custom",
]);

export type ProviderType = z.infer<typeof providerTypeSchema>;

const providerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PROVIDER_NAME_LENGTH);

const providerBaseUrlSchema = z.string().trim().min(1).url().or(z.literal(""));

/**
 * Stored row — the full persisted record, including the Vault pointer and
 * tenant id. Used internally by services; never sent on the wire.
 */
export const providerSchema = z
  .object({
    id: providerIdSchema,
    tenantId: tenantIdSchema,
    name: providerNameSchema,
    providerType: providerTypeSchema,
    baseUrl: z.string().nullable(),
    keyFragment: providerKeyFragmentSchema,
    vaultSecretId: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/**
 * `GET /v1/providers/{id}` wire response. The Vault pointer and tenant id
 * stay internal.
 */
export const providerResponseSchema = z
  .object({
    id: providerIdSchema,
    name: providerNameSchema,
    providerType: providerTypeSchema,
    baseUrl: z.string().nullable(),
    keyFragment: providerKeyFragmentSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const providerListItemSchema = providerResponseSchema.omit({
  baseUrl: true,
  keyFragment: true,
});

export type ProviderListItem = z.infer<typeof providerListItemSchema>;

export const providersResponseSchema = z
  .object({
    providers: z.array(providerListItemSchema),
  })
  .strip();

export const providerModelsResponseSchema = z
  .object({
    models: z.array(
      z
        .object({
          id: z.string().trim().min(1),
        })
        .strip()
    ),
  })
  .strip();

export const providerHistoricalUseDetailsSchema = z
  .object({
    sessionIds: z.array(sessionIdSchema),
    taskRunIds: z.array(taskRunIdSchema),
  })
  .strip();

/**
 * `POST /v1/providers` — name, type, optional base URL, and the API key
 * (plaintext, never stored — goes to Vault). `custom` providers require a
 * non-empty baseUrl. Vercel AI Gateway accepts no base URL because it always
 * uses the first-party Gateway endpoint.
 */
export const createProviderBodySchema = z
  .object({
    name: providerNameSchema,
    providerType: providerTypeSchema,
    baseUrl: providerBaseUrlSchema.nullable().default(null),
    apiKey: z.string().trim().min(1),
  })
  .strict()
  .refine(
    (body) =>
      body.providerType !== "custom" ||
      (body.baseUrl !== null && body.baseUrl.length > 0),
    {
      message: "baseUrl is required for custom providers",
      path: ["baseUrl"],
    }
  )
  .refine(
    (body) =>
      body.providerType !== "vercel_ai_gateway" || body.baseUrl === null,
    {
      message: "baseUrl is not accepted for Vercel AI Gateway providers",
      path: ["baseUrl"],
    }
  );

/** `PATCH /v1/providers/{id}` — only the display name is mutable. */
export const updateProviderBodySchema = z
  .object({
    name: providerNameSchema,
  })
  .strict();

export type Provider = z.infer<typeof providerSchema>;
export type ProvidersResponse = z.infer<typeof providersResponseSchema>;
export type ProviderModelsResponse = z.infer<
  typeof providerModelsResponseSchema
>;
export type ProviderModel = ProviderModelsResponse["models"][number];
export type ProviderHistoricalUseDetails = z.infer<
  typeof providerHistoricalUseDetailsSchema
>;
export interface DeleteProviderOptions {
  confirmSnapshotInvalidation?: boolean;
}
export type ProviderResponse = z.infer<typeof providerResponseSchema>;
export type CreateProviderBody = z.infer<typeof createProviderBodySchema>;
export type UpdateProviderBody = z.infer<typeof updateProviderBodySchema>;

export const thinkingLevelsResponseSchema = z
  .object({
    known: z.boolean(),
    levels: z.array(z.string().min(1)),
  })
  .strip();
export type ThinkingLevelsResponse = z.infer<
  typeof thinkingLevelsResponseSchema
>;
