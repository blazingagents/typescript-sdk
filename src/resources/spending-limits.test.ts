import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch, errorEnvelope } from "../test/fixtures.ts";

const agentId = "ag_0123456789abcdef";
const config = {
  amountUsd: 25.123_456,
  resetStartDate: "2026-10-09",
  resetInterval: "monthly",
} as const;
const enabled = {
  spendingLimit: config,
  period: {
    startsAt: "2026-10-09T00:00:00Z",
    endsAt: "2026-11-09T00:00:00Z",
    spentUsd: 5,
    reservedUsd: 2,
    availableUsd: 18.123_456,
  },
  nextResetAt: "2026-11-09T00:00:00Z",
};
const disabled = {
  spendingLimit: null,
  period: null,
  nextResetAt: null,
};
const stopDetails = {
  scope: "both",
  reason: "reserved",
  spentUsd: 5,
  reservedUsd: 20,
  availableUsd: 0,
  nextResetAt: "2026-11-09T00:00:00Z",
};

for (const scope of ["agent", "tenant"] as const) {
  const path =
    scope === "agent"
      ? `/v1/agents/${agentId}/spending-limit`
      : "/v1/tenant/spending-limit";
  describe(`${scope} spending limit`, () => {
    it.each([enabled, disabled])(
      "gets and decodes the status",
      async (status) => {
        const { fetch, calls } = createMockFetch({ body: status });
        const client = new BlazingAgents({ apiKey: "ba_test", fetch });
        const result =
          scope === "agent"
            ? await client.agents.getSpendingLimit({ agentId })
            : await client.tenant.getSpendingLimit();
        expect(result).toEqual(status);
        expect(new URL(calls[0].url).pathname).toBe(path);
        expect(calls[0].init?.method).toBe("GET");
        expect(calls[0].init?.body).toBeNull();
      }
    );

    it.each([config, null])(
      "puts a config or explicit null",
      async (spendingLimit) => {
        const status = spendingLimit === null ? disabled : enabled;
        const { fetch, calls } = createMockFetch({ body: status });
        const client = new BlazingAgents({ apiKey: "ba_test", fetch });
        const result =
          scope === "agent"
            ? await client.agents.updateSpendingLimit({
                agentId,
                spendingLimit,
              })
            : await client.tenant.updateSpendingLimit({ spendingLimit });
        expect(result).toEqual(status);
        expect(new URL(calls[0].url).pathname).toBe(path);
        expect(calls[0].init?.method).toBe("PUT");
        expect(JSON.parse(String(calls[0].init?.body))).toEqual({
          spendingLimit,
        });
      }
    );

    it("rejects an invalid status response", async () => {
      const { fetch } = createMockFetch({
        body: { ...enabled, period: { ...enabled.period, availableUsd: -1 } },
      });
      const client = new BlazingAgents({ apiKey: "ba_test", fetch });
      const result =
        scope === "agent"
          ? client.agents.getSpendingLimit({ agentId })
          : client.tenant.getSpendingLimit();
      await expect(result).rejects.toMatchObject({ code: "invalid_response" });
    });

    it("preserves the server error and stop details", async () => {
      const { fetch } = createMockFetch({
        status: 429,
        text: errorEnvelope(
          "model_spending_limit_exceeded",
          "Model spending is paused.",
          { details: stopDetails }
        ),
      });
      const client = new BlazingAgents({ apiKey: "ba_test", fetch });
      const result =
        scope === "agent"
          ? client.agents.updateSpendingLimit({
              agentId,
              spendingLimit: config,
            })
          : client.tenant.updateSpendingLimit({ spendingLimit: config });
      await expect(result).rejects.toMatchObject({
        code: "model_spending_limit_exceeded",
        status: 429,
        details: stopDetails,
      });
    });
  });
}

it("preserves a completion preflight spending-limit rejection", async () => {
  const { fetch } = createMockFetch({
    status: 429,
    text: errorEnvelope(
      "model_spending_limit_exceeded",
      "Model spending is paused.",
      { details: stopDetails }
    ),
  });
  const client = new BlazingAgents({ apiKey: "ba_test", fetch });
  await expect(
    client.completion({ agentId, prompt: "Hello" })
  ).rejects.toMatchObject({
    code: "model_spending_limit_exceeded",
    status: 429,
    details: stopDetails,
  });
});
