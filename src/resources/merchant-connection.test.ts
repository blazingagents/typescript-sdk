import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const connection = {
  id: "mch_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  provider: "polar",
  environment: "sandbox",
  merchantAccountId: "org_test_account",
  keyFragment: "k1x9",
  guard: { enabled: true, meterId: "meter_1", productIds: ["prod_1"] },
  configVersion: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.merchantConnection", () => {
  it("get gets /v1/merchant-connection and parses the connection", async () => {
    const { fetch, calls } = createMockFetch({ body: { connection } });
    const result = await client(fetch).merchantConnection.get();
    expect(result.connection?.id).toBe(connection.id);
    expect(result.connection?.tenantId).toBe(connection.tenantId);
    expect(result.connection?.guard.meterId).toBe("meter_1");
    expect(calls[0].url).toBe(`${BASE}/v1/merchant-connection`);
  });

  it("get parses a null connection", async () => {
    const { fetch } = createMockFetch({ body: { connection: null } });
    const result = await client(fetch).merchantConnection.get();
    expect(result.connection).toBeNull();
  });

  it("create posts the connection body", async () => {
    const { fetch, calls } = createMockFetch({
      body: connection,
      status: 201,
    });
    const result = await client(fetch).merchantConnection.create({
      credential: "polar_oat_secret",
      environment: "sandbox",
      guard: { enabled: true, meterId: "meter_1", productIds: ["prod_1"] },
      provider: "polar",
    });
    expect(result).toEqual(connection);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      credential: "polar_oat_secret",
      environment: "sandbox",
      guard: { enabled: true, meterId: "meter_1", productIds: ["prod_1"] },
      provider: "polar",
    });
  });

  it("update patches the connection body", async () => {
    const { fetch, calls } = createMockFetch({ body: connection });
    const result = await client(fetch).merchantConnection.update({
      credential: "polar_new",
    });
    expect(result).toEqual(connection);
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      credential: "polar_new",
    });
  });

  it("rejects a created connection still wrapped under connection", async () => {
    const { fetch } = createMockFetch({ body: { connection }, status: 201 });
    await expect(
      client(fetch).merchantConnection.create({
        credential: "polar_oat_secret",
        environment: "sandbox",
        provider: "polar",
      })
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("retire deletes the connection", async () => {
    const { fetch, calls } = createMockFetch({ status: 204 });
    await expect(
      client(fetch).merchantConnection.retire()
    ).resolves.toBeUndefined();
    expect(calls[0].url).toBe(`${BASE}/v1/merchant-connection`);
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("surfaces backend errors", async () => {
    const { fetch } = createMockFetch({
      body: {
        error: { code: "not_found", message: "No merchant connection." },
      },
      status: 404,
    });
    await expect(
      client(fetch).merchantConnection.retire()
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
