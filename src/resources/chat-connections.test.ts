import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import {
  createChatConnectionBodySchema,
  updateChatConnectionBodySchema,
} from "../contracts/entities/chat-connections.ts";
import { createMockFetch } from "../test/fixtures.ts";

const connection = {
  id: "cc_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  agentId: "ag_0123456789abcdef",
  name: "Support",
  platform: "telegram" as const,
  enabled: false,
  configuration: {
    platform: "telegram" as const,
    botId: "123",
    webhookUrl: "https://api.example.com/callback",
    chatIds: [],
  },
  identity: { botId: "123", botUserId: "123", teamId: null, appId: null },
  health: {
    checkedAt: "2026-09-13T00:00:00Z",
    tokenValid: true,
    identityVerified: true,
    checks: [{ code: "webhook", status: "unknown" as const }],
  },
  credentialFragment: "abcd",
  credentialVersion: 1,
  createdAt: "2026-09-13T00:00:00Z",
  updatedAt: "2026-09-13T00:00:00Z",
};
function setup(body: unknown = connection, status = 200) {
  const mock = createMockFetch({ body, status });
  return {
    ...mock,
    client: new BlazingAgents({
      apiKey: "ba_test",
      baseUrl: "https://api.example.com",
      fetch: mock.fetch,
    }),
  };
}

describe("chatConnections", () => {
  it("lists connections with optional cancellation", async () => {
    const { client, calls } = setup({ chatConnections: [connection] });
    await expect(client.chatConnections.list()).resolves.toEqual({
      chatConnections: [connection],
    });
    const abortSignal = new AbortController().signal;
    await client.chatConnections.list({ abortSignal });
    expect(calls[0].url).toBe("https://api.example.com/v1/chat-connections");
    expect(calls[1].init?.signal).toBe(abortSignal);
  });
  it.each([
    {
      platform: "telegram" as const,
      configuration: {
        botId: "123",
        webhookUrl: "https://api.example.com/callback",
      },
      credentials: { botToken: "123:abc", webhookSecret: "secret" },
    },
    {
      platform: "slack" as const,
      configuration: {
        teamId: "T123",
        appId: "A123",
        webhookUrl: "https://api.example.com/callback",
      },
      credentials: { botToken: "xoxb-token", signingSecret: "a".repeat(32) },
    },
  ])(
    "creates $platform connections without requiring backend defaults",
    async (platformBody) => {
      const { client, calls } = setup();
      const body = {
        ...platformBody,
        name: "Support",
        agentId: connection.agentId,
      };
      const abortSignal = new AbortController().signal;
      await expect(
        client.chatConnections.create({ ...body, abortSignal })
      ).resolves.toEqual(connection);
      expect(calls[0].init?.method).toBe("POST");
      expect(calls[0].init?.signal).toBe(abortSignal);
      expect(JSON.parse(String(calls[0].init?.body))).toEqual(body);
      expect(createChatConnectionBodySchema.parse(body).enabled).toBe(true);
    }
  );
  it.each([
    ["get", "", "GET"],
    ["checkHealth", "/health", "POST"],
    ["enable", "/enable", "POST"],
    ["disable", "/disable", "POST"],
  ] as const)(
    "%s returns the safe connection and forwards cancellation",
    async (action, suffix, method) => {
      const { client, calls } = setup({
        ...connection,
        credentials: { botToken: "never-return" },
        futureField: 1,
        configuration: {
          ...connection.configuration,
          futureField: true,
          botToken: "never-return",
        },
      });
      const abortSignal = new AbortController().signal;
      await expect(
        client
          .withOptions({ clientRequestId: "request-123" })
          .chatConnections[action]({ chatConnectionId: "cc/id", abortSignal })
      ).resolves.toEqual(connection);
      expect(calls[0].url).toBe(
        `https://api.example.com/v1/chat-connections/cc%2Fid${suffix}`
      );
      expect(calls[0].init?.method).toBe(method);
      expect(calls[0].init?.signal).toBe(abortSignal);
      expect(calls[0].init?.body).toBeNull();
    }
  );
  it("updates only the submitted fields", async () => {
    const { client, calls } = setup();
    await client.chatConnections.update({
      chatConnectionId: connection.id,
      name: "New name",
      webhookUrl: "https://api.example.com/final",
    });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "New name",
      webhookUrl: "https://api.example.com/final",
    });
  });
  it.each([
    {
      platform: "slack" as const,
      botToken: "xoxb-token",
      signingSecret: "a".repeat(32),
    },
    {
      platform: "telegram" as const,
      botToken: "123:abc",
      webhookSecret: "secret",
    },
  ])(
    "replaces the complete $platform credential bundle",
    async (credentials) => {
      const { client, calls } = setup();
      await client.chatConnections.rotateCredentials({
        chatConnectionId: connection.id,
        ...credentials,
      });
      expect(calls[0].url).toBe(
        `https://api.example.com/v1/chat-connections/${connection.id}/credentials`
      );
      expect(calls[0].init?.method).toBe("POST");
      expect(JSON.parse(String(calls[0].init?.body))).toEqual(credentials);
    }
  );
  it("deletes with an empty 204 response", async () => {
    const { client, calls } = setup(null, 204);
    await expect(
      client.chatConnections.delete({ chatConnectionId: connection.id })
    ).resolves.toBeUndefined();
    expect(calls[0].init?.method).toBe("DELETE");
  });
  it("rejects empty updates and unsafe callback URLs in the public contracts", () => {
    expect(updateChatConnectionBodySchema.safeParse({}).success).toBe(false);
    expect(
      updateChatConnectionBodySchema.safeParse({ name: "Support" }).success
    ).toBe(true);
    for (const webhookUrl of [
      "http://example.com/callback",
      "https://user:pass@example.com/callback",
      "https://example.com/callback?secret=1",
      "https://example.com/callback#fragment",
    ]) {
      expect(
        updateChatConnectionBodySchema.safeParse({ webhookUrl }).success
      ).toBe(false);
    }
    expect(
      updateChatConnectionBodySchema.safeParse({
        webhookUrl: "https://example.com/callback",
      }).success
    ).toBe(true);
  });
  it("surfaces backend errors", async () => {
    const { client } = setup(
      { error: { code: "not_found", message: "Chat Connection not found" } },
      404
    );
    await expect(
      client.chatConnections.get({ chatConnectionId: connection.id })
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});
