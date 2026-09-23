import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const binding = {
  userId: "user-1",
  customerId: "cust_polar_1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.merchantBindings", () => {
  it("lists bindings with the userId filter and pagination", async () => {
    const { fetch, calls } = createMockFetch({
      body: { bindings: [binding], nextCursor: "next" },
    });
    const result = await client(fetch).merchantBindings.list({
      cursor: "cursor 1",
      limit: 25,
      userId: "user-1",
    });
    expect(result.bindings).toHaveLength(1);
    expect(result.nextCursor).toBe("next");
    expect(calls[0].url).toBe(
      `${BASE}/v1/merchant-connection/bindings?cursor=cursor+1&limit=25&userId=user-1`
    );
  });

  it("lists without filters", async () => {
    const { fetch, calls } = createMockFetch({
      body: { bindings: [], nextCursor: null },
    });
    await client(fetch).merchantBindings.list();
    expect(calls[0].url).toBe(`${BASE}/v1/merchant-connection/bindings`);
  });

  it("put upserts a binding", async () => {
    const { fetch, calls } = createMockFetch({ body: { binding } });
    const result = await client(fetch).merchantBindings.put({
      customerId: "cust_polar_1",
      userId: "user-1",
    });
    expect(result.binding.customerId).toBe("cust_polar_1");
    expect(calls[0].url).toBe(`${BASE}/v1/merchant-connection/bindings/user-1`);
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      customerId: "cust_polar_1",
    });
  });

  it("encodes a userId containing reserved characters", async () => {
    const { fetch, calls } = createMockFetch({ body: { binding } });
    await client(fetch).merchantBindings.put({
      customerId: "cust_polar_1",
      userId: "user/1?x",
    });
    expect(calls[0].url).toBe(
      `${BASE}/v1/merchant-connection/bindings/user%2F1%3Fx`
    );
  });

  it("delete removes a binding", async () => {
    const { fetch, calls } = createMockFetch({ status: 204 });
    await expect(
      client(fetch).merchantBindings.delete({ userId: "user-1" })
    ).resolves.toBeUndefined();
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("surfaces provider validation errors", async () => {
    const { fetch } = createMockFetch({
      body: {
        error: {
          code: "merchant_customer_not_found",
          message: "Customer not found at the provider.",
        },
      },
      status: 422,
    });
    await expect(
      client(fetch).merchantBindings.put({
        customerId: "cust_missing",
        userId: "user-1",
      })
    ).rejects.toMatchObject({
      code: "merchant_customer_not_found",
      status: 422,
    });
  });
});
