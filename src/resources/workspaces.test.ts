import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const workspace = {
  createdAt: "2026-07-30T12:00:00.000Z",
  id: "ws_0123456789abcdef",
  metadata: { project: "alpha" },
  name: "Build files",
  networkPolicy: { mode: "unrestricted" as const },
  tenantId: "ten_0123456789abcdef",
  updatedAt: "2026-07-30T12:00:00.000Z",
  userId: "user-42",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.workspaces", () => {
  it("creates a Workspace with an object-shaped method", async () => {
    const { fetch, calls } = createMockFetch({ body: workspace });

    await expect(
      client(fetch).workspaces.create({
        metadata: { project: "alpha" },
        name: "Build files",
        networkPolicy: {
          allowedHosts: ["registry.npmjs.org"],
          mode: "allowlist",
        },
        userId: "user-42",
      })
    ).resolves.toEqual(workspace);
    expect(calls[0].url).toBe(`${BASE}/v1/workspaces`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({
      networkPolicy: {
        allowedHosts: ["registry.npmjs.org"],
        mode: "allowlist",
      },
    });
  });

  it("gets a Workspace with an object-shaped method", async () => {
    const { fetch, calls } = createMockFetch({ body: workspace });

    await expect(
      client(fetch).workspaces.get({ workspaceId: workspace.id })
    ).resolves.toEqual(workspace);
    expect(calls[0].url).toBe(`${BASE}/v1/workspaces/${workspace.id}`);
  });

  it("lists Workspaces with object-shaped pagination and Attribution filters", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [workspace], nextCursor: "next" },
    });

    await expect(
      client(fetch).workspaces.list({
        cursor: "opaque page",
        limit: 25,
        userId: "user-42",
      })
    ).resolves.toEqual({ data: [workspace], nextCursor: "next" });
    expect(calls[0].url).toBe(
      `${BASE}/v1/workspaces?cursor=opaque+page&limit=25&userId=user-42`
    );
  });

  it("updates a Workspace with one object-shaped input", async () => {
    const { fetch, calls } = createMockFetch({
      body: { ...workspace, name: null },
    });

    await expect(
      client(fetch).workspaces.update({
        metadata: { project: "alpha" },
        name: null,
        networkPolicy: { mode: "offline" },
        workspaceId: workspace.id,
      })
    ).resolves.toMatchObject({ name: null });
    expect(calls[0].url).toBe(`${BASE}/v1/workspaces/${workspace.id}`);
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      metadata: { project: "alpha" },
      name: null,
      networkPolicy: { mode: "offline" },
    });
  });

  it.each([
    [204, "completed"],
    [202, "pending"],
  ] as const)("maps empty HTTP %i deletion to %s", async (status, outcome) => {
    const { fetch, calls } = createMockFetch({ status, text: "" });

    await expect(
      client(fetch).workspaces.delete({ workspaceId: workspace.id })
    ).resolves.toBe(outcome);
    expect(calls[0].url).toBe(`${BASE}/v1/workspaces/${workspace.id}`);
    expect(calls[0].init?.method).toBe("DELETE");
  });
});
