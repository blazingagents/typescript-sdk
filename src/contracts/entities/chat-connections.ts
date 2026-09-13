import { z } from "zod";
import {
  agentIdSchema,
  chatConnectionIdSchema,
  tenantIdSchema,
} from "../ids.ts";

const webhookUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "Use an HTTPS callback URL without credentials, query or fragment");
const secret = z
  .string()
  .min(8)
  .max(8192)
  .regex(/^[!-~]+$/);
export const chatCredentialsSchema = z.discriminatedUnion("platform", [
  z
    .object({
      platform: z.literal("slack"),
      botToken: secret,
      signingSecret: z.string().regex(/^[0-9a-f]{32}$/),
    })
    .strict(),
  z
    .object({
      platform: z.literal("telegram"),
      botToken: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
      webhookSecret: z
        .string()
        .min(1)
        .max(256)
        .regex(/^[A-Za-z0-9_-]+$/),
    })
    .strict(),
]);
const slackConfiguration = z
  .object({
    teamId: z.string().regex(/^T[A-Z0-9]+$/),
    appId: z.string().regex(/^A[A-Z0-9]+$/),
    webhookUrl,
    channelIds: z
      .array(z.string().regex(/^[CG][A-Z0-9]+$/))
      .max(20)
      .default([]),
  })
  .strict();
const telegramConfiguration = z
  .object({
    botId: z.string().regex(/^\d+$/),
    webhookUrl,
    chatIds: z
      .array(z.string().regex(/^-?\d+$/))
      .max(20)
      .default([]),
  })
  .strict();
export const chatConfigurationSchema = z.discriminatedUnion("platform", [
  slackConfiguration.extend({ platform: z.literal("slack") }),
  telegramConfiguration.extend({ platform: z.literal("telegram") }),
]);
const common = {
  agentId: agentIdSchema,
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
};
export const createChatConnectionBodySchema = z.discriminatedUnion("platform", [
  z
    .object({
      ...common,
      platform: z.literal("slack"),
      configuration: slackConfiguration,
      credentials: chatCredentialsSchema.options[0].omit({ platform: true }),
    })
    .strict(),
  z
    .object({
      ...common,
      platform: z.literal("telegram"),
      configuration: telegramConfiguration,
      credentials: chatCredentialsSchema.options[1].omit({ platform: true }),
    })
    .strict(),
]);
export const rotateChatConnectionBodySchema = chatCredentialsSchema;
export const updateChatConnectionBodySchema = z
  .object({ name: common.name.optional(), webhookUrl: webhookUrl.optional() })
  .strict()
  .refine((body) => body.name !== undefined || body.webhookUrl !== undefined, {
    message: "Provide a name or webhook URL",
  });
export const chatConnectionParamsSchema = z.object({
  id: chatConnectionIdSchema,
});
export const chatHealthCheckSchema = z
  .object({
    code: z.string(),
    status: z.enum(["pass", "fail", "unknown"]),
    subject: z.string().optional(),
  })
  .strip();
export const chatHealthSchema = z
  .object({
    checkedAt: z.string(),
    tokenValid: z.boolean(),
    identityVerified: z.boolean(),
    checks: z.array(chatHealthCheckSchema),
  })
  .strip();
export const chatIdentitySchema = z
  .object({
    botId: z.string(),
    botUserId: z.string(),
    teamId: z.string().nullable(),
    appId: z.string().nullable(),
  })
  .strip();
export const chatConnectionSchema = z
  .object({
    id: chatConnectionIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    name: common.name,
    platform: z.enum(["slack", "telegram"]),
    enabled: z.boolean(),
    configuration: z.discriminatedUnion("platform", [
      chatConfigurationSchema.options[0].strip(),
      chatConfigurationSchema.options[1].strip(),
    ]),
    identity: chatIdentitySchema,
    health: chatHealthSchema,
    credentialFragment: z.string().max(4),
    credentialVersion: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip();
export type CreateChatConnectionBody = z.input<
  typeof createChatConnectionBodySchema
>;
export type ChatCredentials = z.output<typeof chatCredentialsSchema>;
export type ChatConfiguration = z.output<typeof chatConfigurationSchema>;
export type ChatHealth = z.output<typeof chatHealthSchema>;
export type ChatIdentity = z.output<typeof chatIdentitySchema>;
export type ChatConnection = z.output<typeof chatConnectionSchema>;
export type UpdateChatConnectionBody = z.output<
  typeof updateChatConnectionBodySchema
>;

export const chatConnectionsResponseSchema = z
  .object({ chatConnections: z.array(chatConnectionSchema) })
  .strip();
export type ChatConnectionsResponse = z.output<
  typeof chatConnectionsResponseSchema
>;
export type RotateChatConnectionBody = z.input<
  typeof rotateChatConnectionBodySchema
>;
