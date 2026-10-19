import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { BlazingAgentsError } from "../errors.ts";
import { createMockFetch } from "../test/fixtures.ts";

const HOSTILE = "../escape?q=1#frag";

const requests: [string, (client: BlazingAgents) => Promise<unknown>][] = [
  ["agents.get", (c) => c.agents.get({ agentId: HOSTILE })],
  ["artifacts.get", (c) => c.artifacts.get({ artifactId: HOSTILE })],
  [
    "mcpConnections.get",
    (c) => c.mcpConnections.get({ mcpConnectionId: HOSTILE }),
  ],
  [
    "memories.get",
    (c) => c.memories.get({ agentId: HOSTILE, memoryId: HOSTILE }),
  ],
  ["prompts.get", (c) => c.prompts.get({ promptId: HOSTILE })],
  ["providers.get", (c) => c.providers.get({ providerId: HOSTILE })],
  ["tasks.getRun", (c) => c.tasks.getRun({ taskId: HOSTILE, runId: HOSTILE })],
  ["usage.getForAgent", (c) => c.usage.getForAgent({ agentId: HOSTILE })],
  [
    "sessions.stop",
    (c) =>
      c.sessions.stop({ agentId: HOSTILE, sessionId: HOSTILE, turnId: "t" }),
  ],
];

describe("path parameters", () => {
  it.each(requests)(
    "%s keeps each ID inside one path segment",
    async (_, call) => {
      const { fetch, calls } = createMockFetch({ body: {} });
      const client = new BlazingAgents({
        apiKey: "ba_test",
        baseUrl: "http://localhost:8787",
        fetch,
      });

      await call(client).catch(() => undefined);

      const url = new URL(calls[0].url);
      expect(url.pathname).toContain(`/${encodeURIComponent(HOSTILE)}`);
      expect(url.searchParams.has("q")).toBe(false);
      expect(url.hash).toBe("");
    }
  );
});

const DOT_SEGMENT_ID = "ss_0123456789abcdef";

describe("dot and empty path segments", () => {
  it.each(["", ".", ".."])(
    "rejects %j with invalid_request before fetch",
    async (segment) => {
      const { fetch, calls } = createMockFetch({ body: {} });
      const client = new BlazingAgents({
        apiKey: "ba_test",
        baseUrl: "http://localhost:8787",
        fetch,
      });
      const target = { agentId: segment, sessionId: DOT_SEGMENT_ID };

      for (const call of [
        () => client.agents.disable({ agentId: segment }),
        () => client.sessions.get(target),
        () => client.sessions.stop({ ...target, turnId: "t" }),
        () =>
          client.forUser("alice").sessions.submitInput({
            ...target,
            requestId: "r",
            message: { id: "m", role: "user", parts: [] },
          }),
      ]) {
        const error = await call().catch((caught: unknown) => caught);
        expect(BlazingAgentsError.isInstance(error)).toBe(true);
        expect(error).toMatchObject({ code: "invalid_request" });
      }
      expect(calls).toHaveLength(0);
    }
  );
});
