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
  mcpConnectionStatusSchema,
  mcpConnectionsResponseSchema,
  mcpConnectionTestResponseSchema,
  mcpOauthAuthorizationLaunchResponseSchema,
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
  it("strips internal fields from public responses", () => {
    expect(
      mcpConnectionResponseSchema.parse(baseConnection)
    ).not.toHaveProperty("vaultSecretId");
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
