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
    businessMode: false,
    chatIds: [],
  },
  webhookUrl:
    "https://api.example.com/v1/chat/webhooks/telegram/cc_0123456789abcdef",
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
        businessMode: false,
      },
      credentials: { botToken: "123:abc" },
    },
    {
      platform: "slack" as const,
      configuration: {
        channelIds: [],
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
    "%s returns the connection and forwards cancellation",
    async (action, suffix, method) => {
      const { client, calls } = setup({
        ...connection,
        futureField: 1,
        configuration: { ...connection.configuration, futureField: true },
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
  it("rejects a connection response that echoes a credential", async () => {
    const { client } = setup({
      ...connection,
      configuration: { ...connection.configuration, botToken: "never-return" },
    });
    await expect(
      client.chatConnections.get({ chatConnectionId: connection.id })
    ).rejects.toMatchObject({
      code: "credential_echo",
      details: { field: "botToken" },
      responseBody: undefined,
    });
  });
  it("updates only the submitted fields", async () => {
    const { client, calls } = setup();
    await client.chatConnections.update({
      chatConnectionId: connection.id,
      name: "New name",
      configuration: { businessMode: true },
    });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "New name",
      configuration: { businessMode: true },
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
  it("rejects empty updates and accepts supported configuration changes", () => {
    expect(updateChatConnectionBodySchema.safeParse({}).success).toBe(false);
    expect(
      updateChatConnectionBodySchema.safeParse({ name: "Support" }).success
    ).toBe(true);
    expect(
      updateChatConnectionBodySchema.safeParse({
        configuration: { businessMode: true },
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

describe("chatConnections deliveries", () => {
  const delivery = {
    id: "cd_0123456789abcdef",
    kind: "reply" as const,
    status: "ambiguous" as const,
    attempt: 0,
    credentialVersion: 1,
    representation: "native",
    diagnostic: "send_interrupted",
    receipts: [{ attempt: 0, messageId: "412" }],
    sessionId: "ss_0123456789abcdef",
    messageId: null,
    approvalId: null,
    threadId: "telegram:5012345678",
    createdAt: "2026-07-10T10:05:00.000Z",
    updatedAt: "2026-07-10T10:05:02.000Z",
  };
  const result = {
    id: delivery.id,
    sessionId: delivery.sessionId,
    threadId: delivery.threadId,
    connectionId: connection.id,
    kind: "reply" as const,
    status: "confirmed" as const,
    attempt: 1,
  };

  it("lists one page of a connection's deliveries", async () => {
    const { client, calls } = setup({
      data: [{ ...delivery, futureField: 1 }],
      nextCursor: "older",
    });
    await expect(
      client.chatConnections.listDeliveries({ chatConnectionId: "cc/id" })
    ).resolves.toEqual({ data: [delivery], nextCursor: "older" });
    expect(calls[0].url).toBe(
      "https://api.example.com/v1/chat-connections/cc%2Fid/deliveries"
    );
    expect(calls[0].init?.method).toBe("GET");
  });

  it("passes cursor and limit as query parameters, not the abort signal", async () => {
    const { client, calls } = setup({ data: [], nextCursor: null });
    const abortSignal = new AbortController().signal;
    await client.chatConnections.listDeliveries({
      chatConnectionId: connection.id,
      cursor: "cursor 1",
      limit: 10,
      abortSignal,
    });
    expect(calls[0].url).toBe(
      `https://api.example.com/v1/chat-connections/${connection.id}/deliveries?cursor=cursor+1&limit=10`
    );
    expect(calls[0].init?.signal).toBe(abortSignal);
  });

  it("rejects a delivery page missing a required field as invalid_response", async () => {
    const { threadId: _, ...withoutThread } = delivery;
    const { client } = setup({ data: [withoutThread], nextCursor: null });
    await expect(
      client.chatConnections.listDeliveries({
        chatConnectionId: connection.id,
      })
    ).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });

  it("repairs a delivery with the confirmations and an expected attempt of 0", async () => {
    const { client, calls } = setup(result);
    const abortSignal = new AbortController().signal;
    await expect(
      client.chatConnections.repairDelivery({
        chatConnectionId: "cc/id",
        deliveryId: "cd/id",
        expectedAttempt: 0,
        previousSenderStopped: true,
        acceptDuplicateRisk: true,
        abortSignal,
      })
    ).resolves.toEqual(result);
    expect(calls[0].url).toBe(
      "https://api.example.com/v1/chat-connections/cc%2Fid/deliveries/cd%2Fid/repair"
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.signal).toBe(abortSignal);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      expectedAttempt: 0,
      previousSenderStopped: true,
      acceptDuplicateRisk: true,
    });
  });

  it("rejects a repair result still pending as invalid_response", async () => {
    const { client } = setup({ ...result, status: "pending" });
    await expect(
      client.chatConnections.repairDelivery({
        chatConnectionId: connection.id,
        deliveryId: delivery.id,
        expectedAttempt: 1,
        previousSenderStopped: true,
        acceptDuplicateRisk: true,
      })
    ).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });
});
