import { z } from "zod";
import {
  agentIdSchema,
  providerIdSchema,
  providerKeyFragmentSchema,
  sessionIdSchema,
  taskIdSchema,
  tenantIdSchema,
} from "../ids.ts";
import { MAX_PROVIDER_NAME_LENGTH } from "../limitations.ts";
import { agentVersionNumberSchema } from "./agents.ts";

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
 * Wire response — `GET /v1/providers` and `GET /v1/providers/{id}` shape per
 * ticket 12: `{ id, name, providerType, baseUrl, keyFragment, createdAt,
 * updatedAt }`. The Vault pointer and tenant id are write-only/internal.
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
  .strict();

export const providersResponseSchema = z
  .object({
    providers: z.array(providerResponseSchema),
  })
  .strict();

export const providerModelsResponseSchema = z
  .object({
    models: z.array(
      z
        .object({
          id: z.string().trim().min(1),
        })
        .strict()
    ),
  })
  .strict();

export const providerHistoricalUseDetailsSchema = z
  .object({
    agentVersions: z.array(
      z
        .object({
          agentId: agentIdSchema,
          version: agentVersionNumberSchema,
        })
        .strict()
    ),
    sessionIds: z.array(sessionIdSchema),
    taskIds: z.array(taskIdSchema),
  })
  .strict();

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
  confirmVersionInvalidation?: boolean;
}
export type ProviderResponse = z.infer<typeof providerResponseSchema>;
export type CreateProviderBody = z.infer<typeof createProviderBodySchema>;
export type UpdateProviderBody = z.infer<typeof updateProviderBodySchema>;
