import {
  BlazingAgents,
  type SessionForkedFrom,
  type SessionResponse,
} from "@blazingagents/sdk";
import {
  sessionForkedFromSchema,
  sessionMessageSchema,
  sessionResponseSchema,
} from "@blazingagents/sdk/contracts";
import { expect, it } from "vitest";

it("forks through the installed package and exposes typed child fields", async () => {
  const provenance: SessionForkedFrom = {
    sessionId: "ss_0123456789abcdef",
    messageId: "assistant-1",
  };
  const child: SessionResponse = sessionResponseSchema.parse({
    id: "ss_child01234567890",
    messageCount: 2,
    lastMessagePreview: "hello",
    userId: "user",
    metadata: {},
    createdAt: "2026-10-06T10:00:00Z",
    updatedAt: "2026-10-06T10:00:00Z",
    forkedFrom: provenance,
    agentConfig: {
      name: "Agent",
      model: null,
      thinkingLevel: null,
      providerId: null,
      autoCompaction: true,
      compactionReserveTokens: 16_384,
      memoryInjectionEnabled: false,
      tools: [],
      instructions: "",
      metadata: {},
      mcpConnectionIds: [],
      approvalInChat: { default: "full", overrides: [] },
      approvalInTasks: { default: "full", overrides: [] },
    },
  });
  const client = new BlazingAgents({
    apiKey: "ba_test",
    // biome-ignore lint/suspicious/useAwait: deterministic protocol fixture
    fetch: async (_url, init) => {
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
        "retry-key"
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        messageId: "assistant-1",
      });
      return new Response(JSON.stringify(child), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const result: SessionResponse = await client.sessions.fork({
    agentId: "ag_0123456789abcdef",
    sessionId: provenance.sessionId,
    messageId: provenance.messageId,
    idempotencyKey: "retry-key",
  });
  const source: SessionForkedFrom | null = result.forkedFrom;
  const branchable: boolean = sessionMessageSchema.parse({
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: "hello" }],
    branchable: true,
  }).branchable;
  expect(source).toEqual(sessionForkedFromSchema.parse(provenance));
  expect(branchable).toBe(true);
});
