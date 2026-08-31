import { describe, expect, it } from "vitest";

import {
  createMcpConnectionBodySchema,
  mcpAttachmentResponseSchema,
  mcpAttachmentsResponseSchema,
  mcpConnectionAuthTypeSchema,
  mcpConnectionLiveDetailsSchema,
  mcpConnectionOauthConnectResponseSchema,
  mcpConnectionReconnectResultSchema,
  mcpConnectionResponseSchema,
  mcpConnectionSchema,
  mcpConnectionStatusSchema,
  mcpConnectionsResponseSchema,
  mcpConnectionTestResponseSchema,
  mcpCredentialBundleSchema,
  mcpOauthAuthorizationLaunchResponseSchema,
  mcpOauthAuthorizationTransactionBundleSchema,
  mcpOauthIssuersMatch,
  reconnectMcpConnectionBodySchema,
  updateMcpAttachmentBodySchema,
  updateMcpConnectionBodySchema,
} from "./mcp-connections.ts";

const connectionId = "mcp_xxxxxxxxxxxxxxxx";
const tenantId = "ten_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";
const baseConnection = {
  id: connectionId,
  tenantId,
  name: "Docs server",
  url: "https://mcp.example.com/tools",
  authType: "none" as const,
  status: "connected" as const,
  credentialVersion: 0,
  credentialFragment: null,
  lastAuthErrorCode: null,
  oauthIssuer: null,
  oauthResource: null,
  tokenExpiresAt: null,
  createdAt: iso,
  updatedAt: iso,
};

describe("MCP OAuth issuer identity", () => {
  it("matches exactly one trailing slash and rejects broader aliases", () => {
    expect(
      mcpOauthIssuersMatch(
        "https://issuer.example.com/tenant",
        "https://issuer.example.com/tenant/"
      )
    ).toBe(true);
    expect(
      mcpOauthIssuersMatch(
        "https://issuer.example.com/tenant/",
        "https://issuer.example.com/tenant"
      )
    ).toBe(true);
    expect(
      mcpOauthIssuersMatch(
        "https://issuer.example.com/tenant//",
        "https://issuer.example.com/tenant"
      )
    ).toBe(false);
  });
});

describe("MCP connection enums", () => {
  it("accepts all forward-compatible auth types", () => {
    for (const authType of [
      "none",
      "bearer",
      "oauth_authorization_code",
      "oauth_client_credentials",
    ]) {
      expect(mcpConnectionAuthTypeSchema.safeParse(authType).success).toBe(
        true
      );
    }
  });

  it("accepts all lifecycle statuses", () => {
    for (const status of ["connected", "needs_auth", "error"]) {
      expect(mcpConnectionStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});

describe("MCP connection schemas", () => {
  it("parses an internal connection row", () => {
    expect(mcpConnectionSchema.parse(baseConnection)).toEqual(baseConnection);
  });

  it("rejects internal fields in public responses", () => {
    expect(mcpConnectionResponseSchema.safeParse(baseConnection).success).toBe(
      false
    );
  });

  it("parses a public response and response envelope", () => {
    const response = {
      id: connectionId,
      name: "Docs server",
      url: "https://mcp.example.com/tools",
      authType: "none" as const,
      status: "connected" as const,
      credentialFragment: null,
      lastAuthErrorCode: null,
      oauthIssuer: null,
      oauthResource: null,
      tokenExpiresAt: null,
      createdAt: iso,
      updatedAt: iso,
    };

    expect(mcpConnectionResponseSchema.parse(response)).toEqual(response);
    expect(
      mcpConnectionsResponseSchema.parse({ mcpConnections: [response] })
    ).toEqual({ mcpConnections: [response] });
  });

  it("parses strict typed live-test outcomes", () => {
    expect(
      mcpConnectionLiveDetailsSchema.parse({
        server: { name: " fixture ", version: " 1.0.0 " },
        toolNames: [" search ", "fetch"],
      })
    ).toEqual({
      server: { name: "fixture", version: "1.0.0" },
      toolNames: ["search", "fetch"],
    });
    expect(
      mcpConnectionTestResponseSchema.parse({
        ok: true,
        latencyMs: 42,
        server: { name: "fixture", version: "1.0.0" },
        toolCount: 2,
        toolNames: ["search", "fetch"],
      })
    ).toEqual({
      ok: true,
      latencyMs: 42,
      server: { name: "fixture", version: "1.0.0" },
      toolCount: 2,
      toolNames: ["search", "fetch"],
    });
    expect(
      mcpConnectionTestResponseSchema.parse({
        ok: false,
        error: {
          code: "MCP_CONNECTION_DISCOVERY_FAILED",
          message: "MCP Tool discovery failed.",
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: "MCP_CONNECTION_DISCOVERY_FAILED",
        message: "MCP Tool discovery failed.",
      },
    });
    expect(
      mcpConnectionTestResponseSchema.safeParse({
        ok: false,
        error: { code: "UPSTREAM_SECRET", message: "unsafe" },
      }).success
    ).toBe(false);
  });

  it("parses strict unauthenticated reconnect contracts", () => {
    const body = {
      authType: "none" as const,
      url: "https://replacement.example.com/mcp",
    };
    expect(reconnectMcpConnectionBodySchema.parse(body)).toEqual(body);
    expect(
      reconnectMcpConnectionBodySchema.safeParse({
        ...body,
        name: "Not part of reconnect",
      }).success
    ).toBe(false);

    const connection = mcpConnectionResponseSchema.parse({
      id: connectionId,
      name: baseConnection.name,
      url: baseConnection.url,
      authType: baseConnection.authType,
      status: baseConnection.status,
      credentialFragment: null,
      lastAuthErrorCode: null,
      oauthIssuer: null,
      oauthResource: null,
      tokenExpiresAt: null,
      createdAt: iso,
      updatedAt: iso,
    });
    expect(
      mcpConnectionReconnectResultSchema.parse({
        status: "connected",
        connection,
      })
    ).toEqual({ status: "connected", connection });
  });

  it("accepts the strict unauthenticated create body and trims values", () => {
    expect(
      createMcpConnectionBodySchema.parse({
        name: "  Docs server  ",
        url: " https://mcp.example.com/tools ",
        authType: "none",
      })
    ).toEqual({
      name: "Docs server",
      url: "https://mcp.example.com/tools",
      authType: "none",
    });
  });

  it("accepts strict bearer create and reconnect bodies without transforming the secret", () => {
    const create = {
      authType: "bearer" as const,
      bearerToken: "secret-canary.token_123",
      name: "Bearer server",
      url: "https://mcp.example.com/tools",
    };
    expect(createMcpConnectionBodySchema.parse(create)).toEqual(create);
    expect(
      reconnectMcpConnectionBodySchema.parse({
        authType: "bearer",
        bearerToken: create.bearerToken,
        url: create.url,
      })
    ).toEqual({
      authType: "bearer",
      bearerToken: create.bearerToken,
      url: create.url,
    });
  });

  it("accepts strict OAuth Client Credentials create and reconnect bodies", () => {
    const credentials = {
      authType: "oauth_client_credentials" as const,
      clientId: "service-client",
      clientSecret: "secret-canary.client-secret",
      scope: "mcp:tools mcp:read",
      url: "https://mcp.example.com/tools",
    };

    expect(
      createMcpConnectionBodySchema.parse({
        ...credentials,
        name: "Service tools",
      })
    ).toEqual({ ...credentials, name: "Service tools" });
    expect(reconnectMcpConnectionBodySchema.parse(credentials)).toEqual(
      credentials
    );
  });

  it("accepts OAuth inputs without caller-selected issuers", () => {
    const clientCredentials = {
      authType: "oauth_client_credentials" as const,
      clientId: "service-client",
      clientSecret: "secret-canary.client-secret",
      name: "Service tools",
      url: "https://mcp.example.com/tools",
    };
    const authorizationCode = {
      authType: "oauth_authorization_code" as const,
      name: "Interactive tools",
      url: "https://mcp.example.com/tools",
    };

    expect(createMcpConnectionBodySchema.parse(clientCredentials)).toEqual(
      clientCredentials
    );
    expect(createMcpConnectionBodySchema.parse(authorizationCode)).toEqual(
      authorizationCode
    );
    expect(
      reconnectMcpConnectionBodySchema.parse({
        authType: authorizationCode.authType,
        url: authorizationCode.url,
      })
    ).toEqual({
      authType: "oauth_authorization_code",
      url: authorizationCode.url,
    });
  });

  it("requires Authorization Code pre-registration fields as an exact pair", () => {
    const base = {
      authType: "oauth_authorization_code" as const,
      name: "Interactive tools",
      url: "https://mcp.example.com/tools",
    };

    expect(
      createMcpConnectionBodySchema.safeParse({
        ...base,
        clientId: "client",
      }).success
    ).toBe(false);
    expect(
      reconnectMcpConnectionBodySchema.safeParse({
        authType: base.authType,
        clientId: "client",
        url: base.url,
      }).success
    ).toBe(false);
    expect(
      reconnectMcpConnectionBodySchema.safeParse({
        authType: base.authType,
        clientSecret: "secret-canary",
        url: base.url,
      }).success
    ).toBe(false);
    expect(
      createMcpConnectionBodySchema.safeParse({
        ...base,
        clientSecret: "secret-canary",
      }).success
    ).toBe(false);
  });

  it("accepts strict pre-registered OAuth Authorization Code create and reconnect bodies", () => {
    const authorizationCode = {
      authType: "oauth_authorization_code" as const,
      clientId: "interactive-client",
      clientSecret: "secret-canary.authorization-client-secret",
      scope: "mcp:tools offline_access",
      url: "https://mcp.example.com/tools",
    };

    expect(
      createMcpConnectionBodySchema.parse({
        ...authorizationCode,
        name: "Interactive tools",
      })
    ).toEqual({ ...authorizationCode, name: "Interactive tools" });
    expect(reconnectMcpConnectionBodySchema.parse(authorizationCode)).toEqual(
      authorizationCode
    );
  });

  it("rejects incomplete and cross-mode OAuth Authorization Code inputs", () => {
    const valid = {
      authType: "oauth_authorization_code",
      clientId: "interactive-client",
      clientSecret: "secret-canary.authorization-client-secret",
      name: "Interactive tools",
      url: "https://mcp.example.com/tools",
    };

    for (const invalid of [
      { ...valid, clientId: "" },
      { ...valid, clientSecret: "" },
      { ...valid, clientSecret: "contains space" },
      { ...valid, oauthIssuer: "https://auth.example.com/" },
      { ...valid, authorizationCode: "not-an-input" },
      { ...valid, redirectUri: "https://attacker.example.com/callback" },
    ]) {
      expect(createMcpConnectionBodySchema.safeParse(invalid).success).toBe(
        false
      );
    }
  });

  it("rejects incomplete, cross-mode, and unsupported OAuth Client Credentials inputs", () => {
    const valid = {
      authType: "oauth_client_credentials",
      clientId: "service-client",
      clientSecret: "secret-canary.client-secret",
      name: "Service tools",
      url: "https://mcp.example.com/tools",
    };

    for (const invalid of [
      { ...valid, clientId: "" },
      { ...valid, clientSecret: "" },
      { ...valid, clientSecret: "contains space" },
      { ...valid, oauthIssuer: "https://auth.example.com/" },
      { ...valid, refreshToken: "not-supported" },
      { ...valid, privateKey: "not-supported" },
      { ...valid, authType: "bearer" },
    ]) {
      expect(createMcpConnectionBodySchema.safeParse(invalid).success).toBe(
        false
      );
    }
  });

  it("rejects missing, whitespace, control-character, oversized, and cross-mode bearer tokens", () => {
    for (const bearerToken of [
      "",
      "contains space",
      "line\nbreak",
      "x".repeat(8193),
    ]) {
      expect(
        createMcpConnectionBodySchema.safeParse({
          authType: "bearer",
          bearerToken,
          name: "Bearer server",
          url: baseConnection.url,
        }).success
      ).toBe(false);
    }
    expect(
      reconnectMcpConnectionBodySchema.safeParse({
        authType: "none",
        bearerToken: "secret-canary",
        url: baseConnection.url,
      }).success
    ).toBe(false);
  });

  it("parses only the complete versioned bearer credential bundle", () => {
    const bundle = {
      bearerToken: "secret-canary.token_123",
      type: "bearer" as const,
      version: 1 as const,
    };
    expect(mcpCredentialBundleSchema.parse(bundle)).toEqual(bundle);
    expect(
      mcpCredentialBundleSchema.safeParse({ ...bundle, version: 2 }).success
    ).toBe(false);
    expect(
      mcpCredentialBundleSchema.safeParse({ ...bundle, vaultSecretId: "no" })
        .success
    ).toBe(false);
  });

  it("round-trips a complete versioned OAuth Client Credentials bundle", () => {
    const bundle = {
      clientInformation: {
        client_id: "service-client",
        client_secret: "secret-canary.client-secret",
        issuer: "https://auth.example.com/",
      },
      discoveryState: {
        authorizationServerMetadata: {
          issuer: "https://auth.example.com/",
          token_endpoint: "https://auth.example.com/token",
          token_endpoint_auth_methods_supported: ["client_secret_basic"],
        },
        authorizationServerUrl: "https://auth.example.com/",
        resourceMetadata: {
          authorization_servers: ["https://auth.example.com/"],
          resource: "https://mcp.example.com/tools",
        },
        resourceMetadataUrl:
          "https://mcp.example.com/.well-known/oauth-protected-resource/tools",
      },
      scope: "mcp:tools mcp:read",
      tokens: {
        access_token: "secret-canary.access-token",
        expires_in: 300,
        issuer: "https://auth.example.com/",
        refresh_token: "secret-canary.unusual-refresh-token",
        scope: "mcp:tools mcp:read",
        token_type: "Bearer",
      },
      type: "oauth_client_credentials" as const,
      version: 1 as const,
    };

    expect(mcpCredentialBundleSchema.parse(bundle)).toEqual(bundle);
    expect(
      mcpCredentialBundleSchema.safeParse({
        ...bundle,
        tokens: {
          ...bundle.tokens,
          id_token: "secret-canary.id-token",
        },
      }).success
    ).toBe(false);
    expect(
      mcpCredentialBundleSchema.safeParse({
        ...bundle,
        clientInformation: null,
      }).success
    ).toBe(false);
    expect(
      mcpCredentialBundleSchema.safeParse({
        ...bundle,
        clientInformation: {
          ...bundle.clientInformation,
          issuer: "https://other.example.com/",
        },
      }).success
    ).toBe(false);
  });

  it("round-trips a complete Authorization Code bundle without id_token", () => {
    const bundle = {
      clientInformation: {
        client_id: "interactive-client",
        client_secret: "secret-canary.authorization-client-secret",
        issuer: "https://auth.example.com/",
      },
      discoveryState: {
        authorizationServerMetadata: {
          authorization_endpoint: "https://auth.example.com/authorize",
          code_challenge_methods_supported: ["S256"],
          issuer: "https://auth.example.com/",
          token_endpoint: "https://auth.example.com/token",
        },
        authorizationServerUrl: "https://auth.example.com/",
        resourceMetadata: {
          authorization_servers: ["https://auth.example.com/"],
          resource: "https://mcp.example.com/tools",
        },
      },
      scope: "mcp:tools offline_access",
      tokens: {
        access_token: "secret-canary.authorization-access-token",
        expires_in: 300,
        issuer: "https://auth.example.com/",
        refresh_token: "secret-canary.authorization-refresh-token",
        token_type: "Bearer",
      },
      type: "oauth_authorization_code" as const,
      version: 1 as const,
    };

    expect(mcpCredentialBundleSchema.parse(bundle)).toEqual(bundle);
    expect(
      mcpCredentialBundleSchema.safeParse({
        ...bundle,
        tokens: { ...bundle.tokens, id_token: "must-not-persist" },
      }).success
    ).toBe(false);
    expect(
      mcpCredentialBundleSchema.safeParse({
        ...bundle,
        clientInformation: null,
      }).success
    ).toBe(false);
    expect(
      mcpCredentialBundleSchema.safeParse({
        ...bundle,
        clientInformation: {
          ...bundle.clientInformation,
          issuer: "https://other.example.com/",
        },
      }).success
    ).toBe(false);
  });

  it("round-trips complete CIMD and DCR client information without requiring a client secret", () => {
    const base = {
      discoveryState: {
        authorizationServerMetadata: {
          authorization_endpoint: "https://auth.example.com/authorize",
          client_id_metadata_document_supported: true,
          code_challenge_methods_supported: ["S256"],
          issuer: "https://auth.example.com/",
          token_endpoint: "https://auth.example.com/token",
        },
        authorizationServerUrl: "https://auth.example.com/",
        resourceMetadata: {
          authorization_servers: ["https://auth.example.com/"],
          resource: "https://mcp.example.com/tools",
        },
      },
      scope: null,
      tokens: null,
      type: "oauth_authorization_code" as const,
      version: 1 as const,
    };
    const cimd = {
      ...base,
      clientInformation: {
        client_id: "https://app.example.com/v1/mcp/oauth/client-metadata",
        issuer: "https://auth.example.com/",
      },
    };
    const dcr = {
      ...base,
      clientInformation: {
        client_id: "dcr-client",
        client_id_issued_at: 1_783_983_600,
        client_secret: "SDK-valid-秘密",
        client_secret_expires_at: 0,
        issuer: "https://auth.example.com/",
        registration_access_token: "secret-canary.registration-token",
        registration_client_uri: "https://auth.example.com/register/dcr-client",
        token_endpoint_auth_method: "client_secret_basic",
      },
    };

    expect(mcpCredentialBundleSchema.parse(cimd)).toEqual(cimd);
    expect(mcpCredentialBundleSchema.parse(dcr)).toEqual(dcr);
  });

  it("parses only a Blazing OAuth initiation URL", () => {
    const setupToken = "A".repeat(43);
    expect(
      mcpConnectionOauthConnectResponseSchema.parse({
        authorizationUrl: `https://app.example.com/app/mcp-connections?mcpOAuthSetup=${setupToken}`,
      })
    ).toEqual({
      authorizationUrl: `https://app.example.com/app/mcp-connections?mcpOAuthSetup=${setupToken}`,
    });
    expect(
      mcpConnectionOauthConnectResponseSchema.safeParse({
        authorizationUrl: `https://auth.example.com/authorize?mcpOAuthSetup=${setupToken}`,
      }).success
    ).toBe(false);
    expect(
      mcpOauthAuthorizationLaunchResponseSchema.parse({
        authorizationUrl: `https://app.example.com/v1/mcp/oauth/authorize?setup=${setupToken}`,
      })
    ).toBeDefined();
    expect(
      mcpConnectionOauthConnectResponseSchema.safeParse({
        authorizationUrl:
          "https://app.example.com/app/mcp-connections?wrong=value",
      }).success
    ).toBe(false);
    expect(
      mcpOauthAuthorizationLaunchResponseSchema.safeParse({
        authorizationUrl:
          "https://app.example.com/v1/mcp/oauth/authorize?wrong=value",
      }).success
    ).toBe(false);
  });

  it("round-trips only the encrypted Authorization Code transaction bundle", () => {
    const transaction = {
      clientInformation: {
        client_id: "interactive-client",
        client_secret: "secret-canary.authorization-client-secret",
        issuer: "https://auth.example.com/",
      },
      codeVerifier: "secret-canary.pkce-verifier",
      credentialVersion: 3,
      discoveryState: {
        authorizationServerMetadata: {
          code_challenge_methods_supported: ["S256"],
          issuer: "https://auth.example.com/",
        },
        authorizationServerUrl: "https://auth.example.com/",
      },
      expectedIssuer: "https://auth.example.com/",
      expectedResource: "https://mcp.example.com/tools",
      redirectUri: "https://app.example.com/v1/mcp/oauth/callback",
      scope: "mcp:tools offline_access",
      type: "oauth_authorization_code_transaction" as const,
      version: 1 as const,
    };

    expect(
      mcpOauthAuthorizationTransactionBundleSchema.parse(transaction)
    ).toEqual(transaction);
    for (const invalid of [
      { ...transaction, state: "secret-canary.oauth-state" },
      { ...transaction, authorizationCode: "secret-canary.authorization-code" },
      { ...transaction, cookie: "secret-canary.cookie" },
      { ...transaction, version: 2 },
      {
        ...transaction,
        clientInformation: {
          ...transaction.clientInformation,
          issuer: "https://other.example.com/",
        },
      },
      { ...transaction, clientInformation: null },
    ]) {
      expect(
        mcpOauthAuthorizationTransactionBundleSchema.safeParse(invalid).success
      ).toBe(false);
    }
  });

  it("rejects create fields reserved for future auth modes", () => {
    expect(
      createMcpConnectionBodySchema.safeParse({
        name: "Docs server",
        url: baseConnection.url,
        authType: "none",
        bearerToken: "secret",
      }).success
    ).toBe(false);
  });

  it("rejects invalid connection URLs", () => {
    for (const url of [
      "ftp://mcp.example.com",
      "file:///tmp/mcp",
      "https://user:pass@mcp.example.com",
      "https://mcp.example.com/tools#fragment",
      "",
      "https://mcp.example.com/tools".repeat(100),
    ]) {
      expect(
        createMcpConnectionBodySchema.safeParse({
          name: "Docs server",
          url,
          authType: "none",
        }).success
      ).toBe(false);
    }
  });

  it("rejects every non-empty query string", () => {
    for (const query of ["?token=secret", "?feature=tools", "?flag"]) {
      expect(
        createMcpConnectionBodySchema.safeParse({
          name: "Docs server",
          url: `https://mcp.example.com/tools${query}`,
          authType: "none",
        }).success
      ).toBe(false);
    }
  });

  it("allows loopback HTTP at the contract layer", () => {
    expect(
      createMcpConnectionBodySchema.safeParse({
        name: "Local server",
        url: "http://127.0.0.1:8787/mcp",
        authType: "none",
      }).success
    ).toBe(true);
  });

  it("requires a non-empty bounded name", () => {
    for (const name of ["", "   ", "x".repeat(81)]) {
      expect(
        createMcpConnectionBodySchema.safeParse({
          name,
          url: baseConnection.url,
          authType: "none",
        }).success
      ).toBe(false);
    }
  });

  it("supports rename-only updates", () => {
    expect(updateMcpConnectionBodySchema.parse({ name: "Renamed" })).toEqual({
      name: "Renamed",
    });
    expect(updateMcpConnectionBodySchema.safeParse({}).success).toBe(false);
    expect(
      updateMcpConnectionBodySchema.safeParse({ url: "https://other.test" })
        .success
    ).toBe(false);
  });

  it("parses strict Attachment settings and partial updates", () => {
    const attachment = {
      mcpConnectionId: connectionId,
      forwardUserId: true,
      forwardedMetadataKeys: ["locale", "profile.locale"],
      createdAt: iso,
      updatedAt: iso,
    };

    expect(mcpAttachmentResponseSchema.parse(attachment)).toEqual(attachment);
    expect(
      mcpAttachmentsResponseSchema.parse({ mcpAttachments: [attachment] })
    ).toEqual({ mcpAttachments: [attachment] });
    expect(
      updateMcpAttachmentBodySchema.parse({ forwardUserId: false })
    ).toEqual({ forwardUserId: false });
    expect(
      updateMcpAttachmentBodySchema.parse({
        forwardedMetadataKeys: ["locale"],
      })
    ).toEqual({ forwardedMetadataKeys: ["locale"] });
  });

  it("rejects invalid Attachment metadata-key selections", () => {
    for (const forwardedMetadataKeys of [
      [""],
      ["x".repeat(65)],
      ["locale", "locale"],
      Array.from({ length: 33 }, (_, index) => `key-${index}`),
    ]) {
      expect(
        updateMcpAttachmentBodySchema.safeParse({ forwardedMetadataKeys })
          .success
      ).toBe(false);
    }
    expect(updateMcpAttachmentBodySchema.safeParse({}).success).toBe(false);
  });
});
