import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const tenantSettings = {
  deletion: null,
  monetizationEnabled: false,
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
    expect(settings.deletion).toBeNull();
    expect(settings.monetizationEnabled).toBe(false);
    expect(calls[0].url).toBe(`${BASE}/v1/tenant`);
  });

  it("get parses the scheduled deletion when the tenant is deleting", async () => {
    const deletion = {
      deletesAt: "2026-09-02T00:00:00.000Z",
      requestedAt: "2026-09-01T00:00:00.000Z",
    };
    const { fetch } = createMockFetch({
      body: { ...tenantSettings, deletion },
    });
    const settings = await client(fetch).tenant.get();
    expect(settings.deletion).toStrictEqual(deletion);
  });

  it("patch PATCHes /v1/tenant", async () => {
    const { fetch, calls } = createMockFetch({
      body: { ...tenantSettings, quota: null },
    });
    const c = client(fetch);
    const settings = await c.tenant.patch({ quota: null });
    expect(settings.quota).toBeNull();
    expect(calls[0].url).toBe(`${BASE}/v1/tenant`);
    expect(calls[0].init?.method).toBe("PATCH");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ quota: null });
  });

  it("patch sends the monetization switch", async () => {
    const { fetch, calls } = createMockFetch({
      body: { ...tenantSettings, monetizationEnabled: true },
    });
    const settings = await client(fetch).tenant.patch({
      monetizationEnabled: true,
    });
    expect(settings.monetizationEnabled).toBe(true);
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ monetizationEnabled: true });
  });
});
