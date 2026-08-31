import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const row = {
  id: "mcp_0123456789abcdef",
  name: "Tools",
  url: "https://mcp.example.com/",
  authType: "none",
  status: "connected",
  credentialFragment: null,
  lastAuthErrorCode: null,
  oauthIssuer: null,
  oauthResource: null,
  tokenExpiresAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.mcpConnections", () => {
  it("starts Authorization Code through the Blazing initiation URL", async () => {
    const setupToken = "A".repeat(43);
    const body = {
      authorizationUrl: `https://app.example.com/app/mcp-connections?mcpOAuthSetup=${setupToken}`,
    };
    const { fetch, calls } = createMockFetch({ body });

    await expect(client(fetch).mcpConnections.connect(row.id)).resolves.toEqual(
      body
    );
    expect(calls[0].url).toBe(`${BASE}/v1/mcp-connections/${row.id}/connect`);
    expect(calls[0].init?.method).toBe("POST");
  });

  it("creates", async () => {
    const { fetch, calls } = createMockFetch({ body: row });
    const result = await client(fetch).mcpConnections.create({
      authType: "none",
      name: "Tools",
      url: row.url,
    });
    expect(result).toEqual(row);
    expect(calls[0].url).toBe(`${BASE}/v1/mcp-connections`);
    expect(calls[0].init?.method).toBe("POST");
  });

  it("creates OAuth connections without a caller-selected issuer", async () => {
    const oauth = {
      ...row,
      authType: "oauth_authorization_code" as const,
      oauthIssuer: "https://login-one.example.com/",
      oauthResource: row.url,
      status: "needs_auth" as const,
    };
    const fixture = createMockFetch({ body: oauth });

    await expect(
      client(fixture.fetch).mcpConnections.create({
        authType: "oauth_authorization_code",
        name: "Tools",
        url: row.url,
      })
    ).resolves.toEqual(oauth);
    expect(
      JSON.parse(fixture.calls[0].init?.body as string)
    ).not.toHaveProperty("oauthIssuer");
  });

  it("sends bearer credentials only in create and reconnect request bodies", async () => {
    const bearer = {
      ...row,
      authType: "bearer" as const,
      credentialFragment: "oken",
    };
    const createFetch = createMockFetch({ body: bearer });
    await client(createFetch.fetch).mcpConnections.create({
      authType: "bearer",
      bearerToken: "secret-canary.token",
      name: "Tools",
      url: row.url,
    });
    expect(JSON.parse(createFetch.calls[0].init?.body as string)).toEqual({
      authType: "bearer",
      bearerToken: "secret-canary.token",
      name: "Tools",
      url: row.url,
    });

    const reconnectFetch = createMockFetch({
      body: { status: "connected", connection: bearer },
    });
    await client(reconnectFetch.fetch).mcpConnections.reconnect(row.id, {
      authType: "bearer",
      bearerToken: "secret-canary.token",
      url: row.url,
    });
    expect(JSON.parse(reconnectFetch.calls[0].init?.body as string)).toEqual({
      authType: "bearer",
      bearerToken: "secret-canary.token",
      url: row.url,
    });
    expect(JSON.stringify(bearer)).not.toContain("secret-canary");
  });

  it("sends OAuth Client Credentials only in create and reconnect bodies", async () => {
    const oauth = {
      ...row,
      authType: "oauth_client_credentials" as const,
      credentialFragment: "cret",
      oauthIssuer: "https://issuer.example.com/",
      oauthResource: row.url,
    };
    const body = {
      authType: "oauth_client_credentials" as const,
      clientId: "client-id",
      clientSecret: "secret-canary.client-secret",
      scope: "tools:call",
      url: row.url,
    };
    const createFetch = createMockFetch({ body: oauth });
    await client(createFetch.fetch).mcpConnections.create({
      ...body,
      name: "Tools",
    });
    expect(JSON.parse(createFetch.calls[0].init?.body as string)).toEqual({
      ...body,
      name: "Tools",
    });

    const reconnectFetch = createMockFetch({
      body: { status: "connected", connection: oauth },
    });
    const result = await client(reconnectFetch.fetch).mcpConnections.reconnect(
      row.id,
      body
    );
    expect(JSON.parse(reconnectFetch.calls[0].init?.body as string)).toEqual(
      body
    );
    expect(JSON.stringify(result)).not.toContain("secret-canary");
  });

  it("lists", async () => {
    const { fetch, calls } = createMockFetch({
      body: { mcpConnections: [row] },
    });
    const result = await client(fetch).mcpConnections.list();
    expect(result.mcpConnections).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/v1/mcp-connections`);
  });

  it("gets", async () => {
    const { fetch, calls } = createMockFetch({ body: row });
    await client(fetch).mcpConnections.get(row.id);
    expect(calls[0].url).toBe(`${BASE}/v1/mcp-connections/${row.id}`);
  });

  it("updates", async () => {
    const { fetch, calls } = createMockFetch({ body: row });
    await client(fetch).mcpConnections.update(row.id, { name: "Renamed" });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      name: "Renamed",
    });
  });

  it("deletes", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    await client(fetch).mcpConnections.delete(row.id);
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("tests a saved connection", async () => {
    const body = {
      ok: true,
      latencyMs: 42,
      server: { name: "fixture", version: "1.0.0" },
      toolCount: 1,
      toolNames: ["search"],
    } as const;
    const { fetch, calls } = createMockFetch({ body });
    await expect(client(fetch).mcpConnections.test(row.id)).resolves.toEqual(
      body
    );
    expect(calls[0].url).toBe(`${BASE}/v1/mcp-connections/${row.id}/test`);
    expect(calls[0].init?.method).toBe("POST");
  });

  it("reconnects a saved connection", async () => {
    const replacement = { ...row, url: "https://replacement.example/mcp" };
    const { fetch, calls } = createMockFetch({
      body: { status: "connected", connection: replacement },
    });
    await expect(
      client(fetch).mcpConnections.reconnect(row.id, {
        authType: "none",
        url: replacement.url,
      })
    ).resolves.toEqual({ status: "connected", connection: replacement });
    expect(calls[0].url).toBe(`${BASE}/v1/mcp-connections/${row.id}/reconnect`);
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      authType: "none",
      url: replacement.url,
    });
  });
});
