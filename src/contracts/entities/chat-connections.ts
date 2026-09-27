import { z } from "zod";
import {
  agentIdSchema,
  chatConnectionIdSchema,
  chatDeliveryIdSchema,
  tenantIdSchema,
} from "../ids.ts";

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
    })
    .strict(),
]);
const slackConfiguration = z
  .object({
    channelIds: z
      .array(z.string().regex(/^[CG][A-Z0-9]+$/))
      .max(20)
      .default([]),
  })
  .strict();
const telegramConfiguration = z
  .object({
    businessMode: z.boolean().default(false),
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
      configuration: slackConfiguration.prefault({}),
      credentials: chatCredentialsSchema.options[0].omit({ platform: true }),
    })
    .strict(),
  z
    .object({
      ...common,
      platform: z.literal("telegram"),
      configuration: telegramConfiguration.prefault({}),
      credentials: chatCredentialsSchema.options[1].omit({ platform: true }),
    })
    .strict(),
]);
export const rotateChatConnectionBodySchema = z.discriminatedUnion("platform", [
  chatCredentialsSchema.options[0],
  chatCredentialsSchema.options[1],
]);
export const updateChatConnectionBodySchema = z
  .object({
    name: common.name.optional(),
    configuration: z
      .object({
        businessMode: z.boolean().optional(),
        chatIds: z
          .array(z.string().regex(/^-?\d+$/))
          .max(20)
          .optional(),
        channelIds: z
          .array(z.string().regex(/^[CG][A-Z0-9]+$/))
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      (body.configuration !== undefined &&
        Object.keys(body.configuration).length > 0),
    { message: "Provide a name or a configuration change" }
  );
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
    webhookUrl: z.url(),
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

export const chatDeliveryStatusSchema = z.enum([
  "pending",
  "confirmed",
  "failed",
  "ambiguous",
]);
export type ChatDeliveryStatus = z.infer<typeof chatDeliveryStatusSchema>;

export const chatDeliveryListStatusSchema = z.enum(["failed", "ambiguous"]);
export type ChatDeliveryListStatus = z.infer<
  typeof chatDeliveryListStatusSchema
>;

export const chatDeliverySchema = z
  .object({
    id: chatDeliveryIdSchema,
    kind: z.enum(["reply", "card"]),
    status: chatDeliveryStatusSchema,
    attempt: z.number().int().nonnegative(),
    credentialVersion: z.number().int().nonnegative(),
    representation: z.string(),
    diagnostic: z.string().nullable(),
    receipts: z.unknown().optional(),
    sessionId: z.string(),
    messageId: z.string().nullable(),
    approvalId: z.string().nullable(),
    threadId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip();
export type ChatDelivery = z.infer<typeof chatDeliverySchema>;

export const tenantChatDeliverySchema = chatDeliverySchema.extend({
  connectionId: chatConnectionIdSchema,
  agentId: agentIdSchema,
  platform: z.enum(["slack", "telegram"]),
});
export type TenantChatDelivery = z.infer<typeof tenantChatDeliverySchema>;

export const chatDeliveriesResponseSchema = z
  .object({
    data: z.array(tenantChatDeliverySchema),
    nextCursor: z.string().nullable(),
  })
  .strip();
export type ChatDeliveriesResponse = z.infer<
  typeof chatDeliveriesResponseSchema
>;
