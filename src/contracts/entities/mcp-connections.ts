import { z } from "zod";

import { mcpConnectionIdSchema, tenantIdSchema } from "../ids.ts";
import {
  MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH,
  MAX_MCP_ATTACHMENT_METADATA_KEYS,
  MAX_MCP_BEARER_TOKEN_LENGTH,
  MAX_MCP_CONNECTION_NAME_LENGTH,
  MAX_MCP_CONNECTION_TEST_LATENCY_MS,
  MAX_MCP_CONNECTION_URL_LENGTH,
  MAX_MCP_OAUTH_CLIENT_ID_LENGTH,
  MAX_MCP_OAUTH_CLIENT_SECRET_LENGTH,
  MAX_MCP_OAUTH_SCOPE_LENGTH,
  MAX_MCP_SERVER_NAME_LENGTH,
  MAX_MCP_SERVER_VERSION_LENGTH,
  MAX_MCP_TOOL_NAME_LENGTH,
  MAX_MCP_TOOLS_PER_CONNECTION,
} from "../limitations.ts";
import {
  atLeastOneFieldMessage,
  hasObjectKeys,
  hasUniqueValues,
} from "../utils.ts";

const OPAQUE_MCP_OAUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const mcpConnectionAuthTypeSchema = z.enum([
  "none",
  "bearer",
  "oauth_authorization_code",
  "oauth_client_credentials",
]);

export const mcpConnectionStatusSchema = z.enum([
  "connected",
  "needs_auth",
  "error",
]);

export const mcpConnectionTestErrorCodeSchema = z.enum([
  "MCP_CONNECTION_AUTHENTICATION_FAILED",
  "MCP_CONNECTION_INVALID",
  "MCP_CONNECTION_UNREACHABLE",
  "MCP_CONNECTION_DISCOVERY_FAILED",
]);

const mcpConnectionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_MCP_CONNECTION_NAME_LENGTH);

const bearerTokenSchema = z
  .string()
  .min(1)
  .max(MAX_MCP_BEARER_TOKEN_LENGTH)
  .regex(/^[!-~]+$/, "Bearer token must contain visible ASCII characters only");

const oauthClientIdSchema = z
  .string()
  .min(1)
  .max(MAX_MCP_OAUTH_CLIENT_ID_LENGTH)
  .regex(/^[!-~]+$/, "Client ID must contain visible ASCII characters only");

const oauthClientSecretSchema = z
  .string()
  .min(1)
  .max(MAX_MCP_OAUTH_CLIENT_SECRET_LENGTH)
  .regex(
    /^[!-~]+$/,
    "Client secret must contain visible ASCII characters only"
  );

const storedOauthClientIdSchema = z
  .string()
  .min(1)
  .max(MAX_MCP_OAUTH_CLIENT_ID_LENGTH);
const storedOauthClientSecretSchema = z
  .string()
  .min(1)
  .max(MAX_MCP_OAUTH_CLIENT_SECRET_LENGTH);

const oauthScopeSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_MCP_OAUTH_SCOPE_LENGTH)
  .regex(
    /^[\x20-\x7e]+$/,
    "Scope must contain printable ASCII characters only"
  );

const oauthIssuerSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          url.username === "" &&
          url.password === "" &&
          url.search === "" &&
          url.hash === ""
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "OAuth issuer must be an http(s) URL without credentials, query, or fragment",
    }
  )
  .transform((value) => new URL(value).toString());

const credentialFragmentSchema = z.string().min(1).max(4).nullable();

/** Mirrors the MCP SDK's SEP-2352 issuer-identity comparison. */
export function mcpOauthIssuersMatch(a: string, b: string): boolean {
  return (
    a === b ||
    (a.endsWith("/") && a.slice(0, -1) === b) ||
    (b.endsWith("/") && b.slice(0, -1) === a)
  );
}

const oauthClientInformationSchema = z.looseObject({
  client_id: storedOauthClientIdSchema,
  client_secret: storedOauthClientSecretSchema.optional(),
  issuer: oauthIssuerSchema,
});

const oauthConfidentialClientInformationSchema =
  oauthClientInformationSchema.safeExtend({
    client_secret: oauthClientSecretSchema,
  });

const oauthTokensSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().positive().optional(),
    issuer: oauthIssuerSchema,
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
    token_type: z.string().min(1),
  })
  .strict();

const oauthDiscoveryStateSchema = z.looseObject({
  authorizationServerMetadata: z.record(z.string(), z.unknown()).optional(),
  authorizationServerUrl: oauthIssuerSchema,
  resourceMetadata: z.record(z.string(), z.unknown()).optional(),
  resourceMetadataUrl: z.string().url().optional(),
});

export const mcpOauthClientCredentialsBundleSchema = z
  .object({
    clientInformation: oauthConfidentialClientInformationSchema,
    discoveryState: oauthDiscoveryStateSchema.nullable(),
    scope: oauthScopeSchema.nullable(),
    tokens: oauthTokensSchema.nullable(),
    type: z.literal("oauth_client_credentials"),
    version: z.literal(1),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      bundle.tokens &&
      bundle.tokens.issuer !== bundle.clientInformation.issuer
    ) {
      context.addIssue({
        code: "custom",
        message: "OAuth token issuer must match the client issuer",
        path: ["tokens", "issuer"],
      });
    }
  });

export const mcpOauthAuthorizationCodeBundleSchema = z
  .object({
    clientInformation: oauthClientInformationSchema.nullable(),
    discoveryState: oauthDiscoveryStateSchema.nullable(),
    scope: oauthScopeSchema.nullable(),
    tokens: oauthTokensSchema.nullable(),
    type: z.literal("oauth_authorization_code"),
    version: z.literal(1),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (bundle.tokens && !bundle.clientInformation) {
      context.addIssue({
        code: "custom",
        message: "OAuth tokens require client information",
        path: ["clientInformation"],
      });
      return;
    }
    if (
      bundle.tokens &&
      bundle.tokens.issuer !== bundle.clientInformation?.issuer
    ) {
      context.addIssue({
        code: "custom",
        message: "OAuth token issuer must match the client issuer",
        path: ["tokens", "issuer"],
      });
    }
  });

export const mcpOauthAuthorizationTransactionBundleSchema = z
  .object({
    clientInformation: oauthClientInformationSchema.nullable(),
    codeVerifier: z.string().min(1).max(1024).nullable(),
    credentialVersion: z.number().int().nonnegative(),
    discoveryState: oauthDiscoveryStateSchema.nullable(),
    expectedIssuer: oauthIssuerSchema,
    expectedResource: z.string().url(),
    redirectUri: z.string().url(),
    scope: oauthScopeSchema.nullable(),
    type: z.literal("oauth_authorization_code_transaction"),
    version: z.literal(1),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      bundle.clientInformation &&
      bundle.clientInformation.issuer !== bundle.expectedIssuer
    ) {
      context.addIssue({
        code: "custom",
        message: "OAuth client issuer must match the expected issuer",
        path: ["clientInformation", "issuer"],
      });
    }
    if (
      (bundle.codeVerifier !== null || bundle.discoveryState !== null) &&
      bundle.clientInformation === null
    ) {
      context.addIssue({
        code: "custom",
        message: "An active OAuth transaction requires client information",
        path: ["clientInformation"],
      });
    }
  });

export const mcpBearerCredentialBundleSchema = z
  .object({
    bearerToken: bearerTokenSchema,
    type: z.literal("bearer"),
    version: z.literal(1),
  })
  .strict();

export const mcpCredentialBundleSchema = z.discriminatedUnion("type", [
  mcpBearerCredentialBundleSchema,
  mcpOauthAuthorizationCodeBundleSchema,
  mcpOauthClientCredentialsBundleSchema,
]);

const mcpConnectionUrlSchema = z
  .string()
  .trim()
  .max(MAX_MCP_CONNECTION_URL_LENGTH)
  .url()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          url.username === "" &&
          url.password === "" &&
          url.hash === "" &&
          url.search === ""
        );
      } catch {
        return false;
      }
    },
    {
      message: "URL must use http(s) without credentials, query, or fragment",
    }
  )
  .transform((value) => new URL(value).toString());

export const mcpConnectionSchema = z
  .object({
    id: mcpConnectionIdSchema,
    tenantId: tenantIdSchema,
    name: mcpConnectionNameSchema,
    url: mcpConnectionUrlSchema,
    authType: mcpConnectionAuthTypeSchema,
    status: mcpConnectionStatusSchema,
    credentialVersion: z.number().int().nonnegative(),
    credentialFragment: credentialFragmentSchema,
    lastAuthErrorCode: mcpConnectionTestErrorCodeSchema.nullable(),
    oauthIssuer: z.string().url().nullable(),
    oauthResource: z.string().url().nullable(),
    tokenExpiresAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const mcpConnectionResponseSchema = z
  .object({
    id: mcpConnectionIdSchema,
    name: mcpConnectionNameSchema,
    url: mcpConnectionUrlSchema,
    authType: mcpConnectionAuthTypeSchema,
    status: mcpConnectionStatusSchema,
    credentialFragment: credentialFragmentSchema,
    lastAuthErrorCode: mcpConnectionTestErrorCodeSchema.nullable(),
    oauthIssuer: z.string().url().nullable(),
    oauthResource: z.string().url().nullable(),
    tokenExpiresAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const mcpConnectionsResponseSchema = z
  .object({
    mcpConnections: z.array(mcpConnectionResponseSchema),
  })
  .strict();

export const forwardedMetadataKeysSchema = z
  .array(z.string().min(1).max(MAX_MCP_ATTACHMENT_METADATA_KEY_LENGTH))
  .max(MAX_MCP_ATTACHMENT_METADATA_KEYS)
  .refine(hasUniqueValues, {
    message: "Forwarded metadata keys must be unique.",
  });

export const mcpAttachmentResponseSchema = z
  .object({
    mcpConnectionId: mcpConnectionIdSchema,
    forwardUserId: z.boolean(),
    forwardedMetadataKeys: forwardedMetadataKeysSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const mcpAttachmentsResponseSchema = z
  .object({
    mcpAttachments: z.array(mcpAttachmentResponseSchema),
  })
  .strict();

export const updateMcpAttachmentBodySchema = z
  .object({
    forwardUserId: z.boolean().optional(),
    forwardedMetadataKeys: forwardedMetadataKeysSchema.optional(),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

const createNoneMcpConnectionBodySchema = z
  .object({
    name: mcpConnectionNameSchema,
    url: mcpConnectionUrlSchema,
    authType: z.literal("none"),
  })
  .strict();

const createBearerMcpConnectionBodySchema = z
  .object({
    name: mcpConnectionNameSchema,
    url: mcpConnectionUrlSchema,
    authType: z.literal("bearer"),
    bearerToken: bearerTokenSchema,
  })
  .strict();

const oauthClientCredentialsFields = {
  authType: z.literal("oauth_client_credentials"),
  clientId: oauthClientIdSchema,
  clientSecret: oauthClientSecretSchema,
  scope: oauthScopeSchema.optional(),
  url: mcpConnectionUrlSchema,
};

const oauthAuthorizationCodeFields = {
  authType: z.literal("oauth_authorization_code"),
  clientId: oauthClientIdSchema.optional(),
  clientSecret: oauthClientSecretSchema.optional(),
  scope: oauthScopeSchema.optional(),
  url: mcpConnectionUrlSchema,
};

const createOauthAuthorizationCodeMcpConnectionBodySchema = z
  .object({
    ...oauthAuthorizationCodeFields,
    name: mcpConnectionNameSchema,
  })
  .strict();

const createOauthClientCredentialsMcpConnectionBodySchema = z
  .object({
    ...oauthClientCredentialsFields,
    name: mcpConnectionNameSchema,
  })
  .strict();

export const createMcpConnectionBodySchema = z
  .discriminatedUnion("authType", [
    createNoneMcpConnectionBodySchema,
    createBearerMcpConnectionBodySchema,
    createOauthAuthorizationCodeMcpConnectionBodySchema,
    createOauthClientCredentialsMcpConnectionBodySchema,
  ])
  .superRefine((body, context) => {
    if (
      body.authType === "oauth_authorization_code" &&
      (body.clientId === undefined) !== (body.clientSecret === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "OAuth client ID and secret must be provided together",
        path: [body.clientId === undefined ? "clientId" : "clientSecret"],
      });
    }
  });

export const updateMcpConnectionBodySchema = z
  .object({
    name: mcpConnectionNameSchema.optional(),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

export const reconnectMcpConnectionBodySchema = z
  .discriminatedUnion("authType", [
    z
      .object({
        authType: z.literal("none"),
        url: mcpConnectionUrlSchema,
      })
      .strict(),
    z
      .object({
        authType: z.literal("bearer"),
        bearerToken: bearerTokenSchema,
        url: mcpConnectionUrlSchema,
      })
      .strict(),
    z.object(oauthAuthorizationCodeFields).strict(),
    z.object(oauthClientCredentialsFields).strict(),
  ])
  .superRefine((body, context) => {
    if (
      body.authType === "oauth_authorization_code" &&
      (body.clientId === undefined) !== (body.clientSecret === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "OAuth client ID and secret must be provided together",
        path: [body.clientId === undefined ? "clientId" : "clientSecret"],
      });
    }
  });

export const mcpConnectionOauthConnectResponseSchema = z
  .object({
    authorizationUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.pathname === "/app/mcp-connections" &&
          url.username === "" &&
          url.password === "" &&
          url.hash === "" &&
          url.searchParams.size === 1 &&
          OPAQUE_MCP_OAUTH_TOKEN_PATTERN.test(
            url.searchParams.get("mcpOAuthSetup") ?? ""
          )
        );
      }),
  })
  .strict();

export const mcpOauthAuthorizationLaunchResponseSchema = z
  .object({
    authorizationUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.pathname === "/v1/mcp/oauth/authorize" &&
          url.username === "" &&
          url.password === "" &&
          url.hash === "" &&
          url.searchParams.size === 1 &&
          OPAQUE_MCP_OAUTH_TOKEN_PATTERN.test(
            url.searchParams.get("setup") ?? ""
          )
        );
      }),
  })
  .strict();

export const approveMcpOauthAuthorizationBodySchema = z
  .object({ setupToken: z.string().regex(OPAQUE_MCP_OAUTH_TOKEN_PATTERN) })
  .strict();

export const mcpConnectionLiveDetailsSchema = z
  .object({
    server: z
      .object({
        name: z.string().trim().min(1).max(MAX_MCP_SERVER_NAME_LENGTH),
        version: z.string().trim().min(1).max(MAX_MCP_SERVER_VERSION_LENGTH),
      })
      .strict(),
    toolNames: z
      .array(z.string().trim().min(1).max(MAX_MCP_TOOL_NAME_LENGTH))
      .max(MAX_MCP_TOOLS_PER_CONNECTION),
  })
  .strict();

const mcpConnectionTestOkResponseSchema = mcpConnectionLiveDetailsSchema
  .extend({
    ok: z.literal(true),
    latencyMs: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_MCP_CONNECTION_TEST_LATENCY_MS),
    toolCount: z.number().int().nonnegative().max(MAX_MCP_TOOLS_PER_CONNECTION),
  })
  .strict()
  .refine((result) => result.toolCount === result.toolNames.length, {
    message: "toolCount must match toolNames length",
  });

const mcpConnectionTestFailResponseSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: mcpConnectionTestErrorCodeSchema,
        message: z.string().trim().min(1).max(200),
      })
      .strict(),
  })
  .strict();

export const mcpConnectionTestResponseSchema = z.discriminatedUnion("ok", [
  mcpConnectionTestOkResponseSchema,
  mcpConnectionTestFailResponseSchema,
]);

export const mcpConnectionReconnectResultSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("connected"),
        connection: mcpConnectionResponseSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("needs_auth"),
        connection: mcpConnectionResponseSchema,
      })
      .strict(),
  ]
);

export type McpConnectionAuthType = z.infer<typeof mcpConnectionAuthTypeSchema>;
export type McpCredentialBundle = z.infer<typeof mcpCredentialBundleSchema>;
export type McpOauthClientCredentialsBundle = z.infer<
  typeof mcpOauthClientCredentialsBundleSchema
>;
export type McpOauthAuthorizationCodeBundle = z.infer<
  typeof mcpOauthAuthorizationCodeBundleSchema
>;
export type McpOauthAuthorizationTransactionBundle = z.infer<
  typeof mcpOauthAuthorizationTransactionBundleSchema
>;
export type McpConnectionStatus = z.infer<typeof mcpConnectionStatusSchema>;
export type McpConnectionTestErrorCode = z.infer<
  typeof mcpConnectionTestErrorCodeSchema
>;
export type McpConnectionLiveDetails = z.infer<
  typeof mcpConnectionLiveDetailsSchema
>;
export type McpConnection = z.infer<typeof mcpConnectionSchema>;
export type McpConnectionResponse = z.infer<typeof mcpConnectionResponseSchema>;
export type McpConnectionsResponse = z.infer<
  typeof mcpConnectionsResponseSchema
>;
export type CreateMcpConnectionBody = z.infer<
  typeof createMcpConnectionBodySchema
>;
export type UpdateMcpConnectionBody = z.infer<
  typeof updateMcpConnectionBodySchema
>;
export type ReconnectMcpConnectionBody = z.infer<
  typeof reconnectMcpConnectionBodySchema
>;
export type McpConnectionTestResponse = z.infer<
  typeof mcpConnectionTestResponseSchema
>;
export type McpConnectionReconnectResult = z.infer<
  typeof mcpConnectionReconnectResultSchema
>;
export type McpConnectionOauthConnectResponse = z.infer<
  typeof mcpConnectionOauthConnectResponseSchema
>;
export type ApproveMcpOauthAuthorizationBody = z.infer<
  typeof approveMcpOauthAuthorizationBodySchema
>;
export type McpOauthAuthorizationLaunchResponse = z.infer<
  typeof mcpOauthAuthorizationLaunchResponseSchema
>;
export type McpAttachmentResponse = z.infer<typeof mcpAttachmentResponseSchema>;
export type McpAttachmentsResponse = z.infer<
  typeof mcpAttachmentsResponseSchema
>;
export type UpdateMcpAttachmentBody = z.infer<
  typeof updateMcpAttachmentBodySchema
>;
