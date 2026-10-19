import { z } from "zod";
import {
  agentIdSchema,
  chatConnectionIdSchema,
  chatDeliveryIdSchema,
  tenantIdSchema,
} from "../ids.ts";

const slackBotToken = z
  .string()
  .min(8)
  .max(8192)
  .regex(/^[!-~]+$/);
const slackSigningSecret = z.string().regex(/^[0-9a-f]{32}$/);
const telegramBotToken = z.string().regex(/^\d+:[A-Za-z0-9_-]+$/);
const slackChannelIds = z.array(z.string().regex(/^[CG][A-Z0-9]+$/)).max(20);
const telegramChatIds = z.array(z.string().regex(/^-?\d+$/)).max(20);

/** The credentials a client sends; the server never returns them. */
export const chatCredentialsSchema = z.discriminatedUnion("platform", [
  z
    .object({
      platform: z.literal("slack"),
      botToken: slackBotToken,
      signingSecret: slackSigningSecret,
    })
    .strict(),
  z
    .object({
      platform: z.literal("telegram"),
      botToken: telegramBotToken,
    })
    .strict(),
]);
const slackConfiguration = z
  .object({
    channelIds: slackChannelIds.default([]),
  })
  .strict();
const telegramConfiguration = z
  .object({
    businessMode: z.boolean().default(false),
    chatIds: telegramChatIds.default([]),
  })
  .strict();
export const chatConfigurationSchema = z.discriminatedUnion("platform", [
  slackConfiguration.extend({ platform: z.literal("slack") }),
  telegramConfiguration.extend({ platform: z.literal("telegram") }),
]);
const connectionName = z.string().trim().min(1).max(80);
const common = {
  agentId: agentIdSchema.describe(
    "ID of the agent that answers messages on this connection. You cannot change it later."
  ),
  name: connectionName.describe("Display name, 1 to 80 characters."),
  enabled: z
    .boolean()
    .default(true)
    .describe("Whether the connection accepts messages. Defaults to `true`."),
};
const configurationDescription =
  "Optional platform settings. Destination IDs choose where health checks look; they do not restrict who can talk to the agent.";
const platformDescription = "Chat platform: `slack` or `telegram`.";
export const createChatConnectionBodySchema = z.discriminatedUnion("platform", [
  z
    .object({
      ...common,
      platform: z.literal("slack").describe(platformDescription),
      configuration: slackConfiguration
        .prefault({})
        .describe(configurationDescription),
      credentials: z
        .object({
          botToken: slackBotToken,
          signingSecret: slackSigningSecret,
        })
        .strict()
        .describe("The Slack app's bot token and signing secret."),
    })
    .strict(),
  z
    .object({
      ...common,
      platform: z.literal("telegram").describe(platformDescription),
      configuration: telegramConfiguration
        .prefault({})
        .describe(configurationDescription),
      credentials: z
        .object({ botToken: telegramBotToken })
        .strict()
        .describe("The Telegram bot token from BotFather."),
    })
    .strict(),
]);
export const rotateChatConnectionBodySchema = z.discriminatedUnion("platform", [
  z
    .object({
      platform: z
        .literal("slack")
        .describe("Must match the connection's platform."),
      botToken: slackBotToken.describe("The new Slack bot token."),
      signingSecret: slackSigningSecret.describe(
        "The Slack app's signing secret."
      ),
    })
    .strict(),
  z
    .object({
      platform: z
        .literal("telegram")
        .describe("Must match the connection's platform."),
      botToken: telegramBotToken.describe("The new Telegram bot token."),
    })
    .strict(),
]);
export const updateChatConnectionBodySchema = z
  .object({
    name: connectionName.optional().describe("New display name."),
    configuration: z
      .object({
        businessMode: z.boolean().optional(),
        chatIds: telegramChatIds.optional(),
        channelIds: slackChannelIds.optional(),
      })
      .strict()
      .optional()
      .describe(
        "Fields to change. Slack connections accept `channelIds`; Telegram connections accept `chatIds` and `businessMode`. Fields you leave out keep their values."
      ),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      (body.configuration !== undefined &&
        Object.keys(body.configuration).length > 0),
    { message: "Provide a name or a configuration change" }
  );
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
    name: connectionName,
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
    webhookUrl: z.url(),
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
  .object({ chatConnections: chatConnectionSchema.array() })
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
    status: z.enum(["pending", "confirmed", "failed", "ambiguous"]),
    attempt: z.number().int().nonnegative(),
    credentialVersion: z.number().int().nonnegative(),
    representation: z.string(),
    diagnostic: z.string().nullable(),
    receipts: z.unknown(),
    sessionId: z.string(),
    messageId: z.string().nullable(),
    approvalId: z.string().nullable(),
    threadId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip();
export type ChatDelivery = z.infer<typeof chatDeliverySchema>;

export const tenantChatDeliverySchema = chatDeliverySchema
  .extend({
    connectionId: chatConnectionIdSchema,
    agentId: agentIdSchema,
    platform: z.enum(["slack", "telegram"]),
  })
  .strict();
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

export const chatDeliveryListSchema = z
  .object({
    data: z.array(chatDeliverySchema),
    nextCursor: z.string().nullable(),
  })
  .strip();
export type ChatDeliveryList = z.infer<typeof chatDeliveryListSchema>;

export const repairChatDeliveryBodySchema = z
  .object({
    expectedAttempt: z.number().int().min(0).max(99),
    previousSenderStopped: z.literal(true),
    acceptDuplicateRisk: z.literal(true),
  })
  .strict();
export type RepairChatDeliveryBody = z.input<
  typeof repairChatDeliveryBodySchema
>;

export const chatDeliveryResultSchema = z
  .object({
    id: chatDeliveryIdSchema,
    sessionId: z.string(),
    threadId: z.string(),
    connectionId: chatConnectionIdSchema,
    kind: z.enum(["reply", "card"]),
    status: z.enum(["confirmed", "failed", "ambiguous"]),
    attempt: z.number().int().nonnegative(),
  })
  .strip();
export type ChatDeliveryResult = z.infer<typeof chatDeliveryResultSchema>;
