import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const tenantSettings = {
  name: "My Workspace",
  quota: {
    monthlyTokenLimit: 1_000_000,
    monthlyRequestLimit: 1000,
    resetDay: 1,
  },
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.tenant", () => {
  it("get gets /v1/tenant", async () => {
    const { fetch, calls } = createMockFetch({ body: tenantSettings });
    const c = client(fetch);
    const settings = await c.tenant.get();
    expect(settings.name).toBe("My Workspace");
    expect(settings.quota?.monthlyTokenLimit).toBe(1_000_000);
    expect(calls[0].url).toBe(`${BASE}/v1/tenant`);
  });

  it("patch PATCHes /v1/tenant", async () => {
    const { fetch, calls } = createMockFetch({
      body: { name: "My Workspace", quota: null },
    });
    const c = client(fetch);
    const settings = await c.tenant.patch({ quota: null });
    expect(settings.quota).toBeNull();
    expect(calls[0].url).toBe(`${BASE}/v1/tenant`);
    expect(calls[0].init?.method).toBe("PATCH");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ quota: null });
  });
});
