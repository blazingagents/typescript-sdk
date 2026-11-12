import { describe, expect, it, vi } from "vitest";
import { agentRow } from "./test/fixtures.ts";

vi.mock("ai", () => {
  throw new Error("the ai package is not installed");
});

const BASE = "http://localhost:8787";

function page(rows: unknown[]) {
  return new Response(JSON.stringify({ data: rows, nextCursor: null }), {
    status: 200,
  });
}

describe("@blazingagents/sdk/rest", () => {
  it("lists Agents without loading the ai package", async () => {
    const { BlazingAgentsRest } = await import("./rest.ts");
    const fetch = vi.fn(async () => page([agentRow()]));
    const sdk = new BlazingAgentsRest({
      apiKey: "ba_test",
      baseUrl: BASE,
      fetch,
    });

    const result = await sdk.agents.list();

    expect(result.data).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/v1/agents`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("carries a caller's correlation ID through withOptions", async () => {
    const { BlazingAgentsRest } = await import("./rest.ts");
    const fetch = vi.fn(async () => page([]));
    const sdk = new BlazingAgentsRest({
      apiKey: "ba_test",
      baseUrl: `${BASE}/`,
      fetch,
    }).withOptions({ clientRequestId: "req-mobile-1" });

    await sdk.prompts.list();

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/v1/prompts`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-client-request-id": "req-mobile-1",
        }),
      })
    );
  });

  it("rejects a failed request with the entry's error type", async () => {
    const { BlazingAgentsError, BlazingAgentsRest } = await import("./rest.ts");
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "not_found", message: "No Agent." },
          }),
          { status: 404 }
        )
    );
    const sdk = new BlazingAgentsRest({
      apiKey: "ba_test",
      baseUrl: BASE,
      fetch,
    });

    const error = await sdk.agents
      .get({ agentId: "ag_0123456789abcdef" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BlazingAgentsError);
    expect(error).toMatchObject({ code: "not_found", status: 404 });
  });
});
