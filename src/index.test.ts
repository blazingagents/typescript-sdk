import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "./index.ts";
import { createMockFetch } from "./test/fixtures.ts";

describe("sdk smoke", () => {
  it("constructs a client with the default base url", () => {
    const client = new BlazingAgents({ apiKey: "ba_test" });
    expect(client.agents).toBeDefined();
    expect(client.sessions).toBeDefined();
    expect(client.agent("ag_0123456789abcdef").skills).toBeDefined();
    expect("skills" in client).toBe(false);
    expect(client.providers).toBeDefined();
    expect(client.mcpConnections).toBeDefined();
    expect(client.memories).toBeDefined();
    expect(client.prompts).toBeDefined();
    expect("apiKeys" in client).toBe(false);
    expect(client.usage).toBeDefined();
    expect(client.artifacts).toBeDefined();
    expect(client.tasks).toBeDefined();
    expect(client.tenant).toBeDefined();
  });

  it("sends requests to the default API endpoint", async () => {
    const { fetch, calls } = createMockFetch({ body: { agents: [] } });
    const client = new BlazingAgents({ apiKey: "ba_test", fetch });

    await client.agents.list();

    expect(calls[0]?.url).toBe("https://api.blazingagents.com/v1/agents");
  });

  it("normalizes every trailing slash in a custom base URL", async () => {
    const { fetch, calls } = createMockFetch({ body: { agents: [] } });
    const client = new BlazingAgents({
      apiKey: "ba_test",
      baseUrl: "https://api.example.test///",
      fetch,
    });

    await client.agents.list();

    expect(calls[0]?.url).toBe("https://api.example.test/v1/agents");
  });

  it("scopes caller correlation to a client view", async () => {
    const { fetch, calls } = createMockFetch({ body: { agents: [] } });
    const onResponse = vi.fn();
    const client = new BlazingAgents({
      apiKey: "ba_test",
      fetch,
      onResponse,
    });

    await client
      .withOptions({ clientRequestId: "management-attempt-1" })
      .agents.list();
    await client.agents.list();

    expect(
      new Headers(calls[0]?.init?.headers).get("x-client-request-id")
    ).toBe("management-attempt-1");
    expect(
      new Headers(calls[1]?.init?.headers).get("x-client-request-id")
    ).toBeNull();
    expect(onResponse.mock.calls[0]?.[0]).toMatchObject({
      clientRequestId: "management-attempt-1",
      path: "/v1/agents",
    });
  });
});
