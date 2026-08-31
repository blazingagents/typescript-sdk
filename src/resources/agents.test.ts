import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "../client.ts";
import { agentRow, createMockFetch, errorEnvelope } from "../test/fixtures.ts";
import type { BlazingAgentsFetch } from "../types.ts";

const BASE = "http://localhost:8787";

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

const agentVersion = {
  agentId: "ag_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  version: 3,
  name: "Historical Builder",
  model: "anthropic/claude-sonnet-4.5",
  providerId: "prv_0123456789abcdef",
  memoryInjectionEnabled: true,
  tools: ["workspace", "write_todos"],
  instructions: "Historical instructions.",
  metadata: { source: "version-3" },
  mcpConnectionIds: ["mcp_0123456789abcdef"],
  createdAt: "2026-07-19T12:00:00.000Z",
};

describe("client.agents", () => {
  it("create posts to /v1/agents and parses the response", async () => {
    const { fetch, calls } = createMockFetch({ body: agentRow() });
    const c = client(fetch);
    const agent = await c.agents.create({
      name: "Builder",
      model: "openrouter/test",
      tools: ["workspace"],
      instructions: "",
      providerId: "prv_0123456789abcdef",
    });
    expect(agent.id).toBe("ag_0123456789abcdef");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/agents`);
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.name).toBe("Builder");
    expect(body).not.toHaveProperty("workspaceId");
    expect(agent.workspaceId).toBe("ws_0123456789abcdef");
  });

  it("create threads end-user attribution (userId + metadata) into the body", async () => {
    const { fetch, calls } = createMockFetch({
      body: agentRow({ userId: "user-42", metadata: { tier: "pro" } }),
    });
    const c = client(fetch);
    const agent = await c.agents.create({
      name: "Builder",
      userId: "user-42",
      metadata: { tier: "pro" },
    });
    expect(agent.userId).toBe("user-42");
    expect(agent.metadata).toEqual({ tier: "pro" });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.userId).toBe("user-42");
    expect(body.metadata).toEqual({ tier: "pro" });
  });

  it("round-trips the automatic memory injection toggle", async () => {
    const created = createMockFetch({
      body: agentRow({ memoryInjectionEnabled: true }),
    });
    const updated = createMockFetch({
      body: agentRow({ memoryInjectionEnabled: false }),
    });

    await expect(
      client(created.fetch).agents.create({
        name: "Memory agent",
        memoryInjectionEnabled: true,
      })
    ).resolves.toMatchObject({ memoryInjectionEnabled: true });
    await expect(
      client(updated.fetch).agents.update("ag_0123456789abcdef", {
        memoryInjectionEnabled: false,
      })
    ).resolves.toMatchObject({ memoryInjectionEnabled: false });

    expect(JSON.parse(created.calls[0].init?.body as string)).toMatchObject({
      memoryInjectionEnabled: true,
    });
    expect(JSON.parse(updated.calls[0].init?.body as string)).toEqual({
      memoryInjectionEnabled: false,
    });
  });

  it("list gets /v1/agents and parses { agents: [...] }", async () => {
    const { fetch } = createMockFetch({ body: { agents: [agentRow()] } });
    const c = client(fetch);
    const result = await c.agents.list();
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].id).toBe("ag_0123456789abcdef");
  });

  it.each([
    [undefined, `${BASE}/v1/agents`],
    [{ userId: "" }, `${BASE}/v1/agents?userId=`],
    [
      {
        userId: "end user/1",
        workspaceId: "ws_0123456789abcdef",
      },
      `${BASE}/v1/agents?userId=end+user%2F1&workspaceId=ws_0123456789abcdef`,
    ],
  ])("serializes list filters %#", async (options, expectedUrl) => {
    const { fetch, calls } = createMockFetch({ body: { agents: [] } });
    await client(fetch).agents.list(options);
    expect(calls[0].url).toBe(expectedUrl);
  });

  it("get gets /v1/agents/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: agentRow() });
    const c = client(fetch);
    const agent = await c.agents.get("ag_0123456789abcdef");
    expect(agent.id).toBe("ag_0123456789abcdef");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef`);
  });

  it("lists full Agent Versions with optional pagination", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [agentVersion], nextCursor: "next" },
    });

    await expect(
      client(fetch).agents.listVersions("ag_0123456789abcdef", {
        cursor: "opaque page",
        limit: 25,
      })
    ).resolves.toEqual({ data: [agentVersion], nextCursor: "next" });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/versions?cursor=opaque+page&limit=25`
    );
  });

  it("lists Agent Versions without query parameters when options are omitted", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });

    await client(fetch).agents.listVersions("ag_0123456789abcdef");

    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef/versions`);
  });

  it("gets one full immutable Agent Version", async () => {
    const { fetch, calls } = createMockFetch({ body: agentVersion });

    await expect(
      client(fetch).agents.getVersion("ag_0123456789abcdef", 3)
    ).resolves.toEqual(agentVersion);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/versions/3`
    );
  });

  it("restores by copying every versioned field through ordinary update", async () => {
    const fetch = vi
      .fn<BlazingAgentsFetch>()
      .mockResolvedValueOnce(Response.json(agentVersion))
      .mockResolvedValueOnce(
        Response.json(
          agentRow({
            name: agentVersion.name,
            memoryInjectionEnabled: true,
            version: 4,
          })
        )
      );

    await expect(
      client(fetch).agents.restoreVersion("ag_0123456789abcdef", 3)
    ).resolves.toMatchObject({
      name: "Historical Builder",
      version: 4,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/versions/3`
    );
    expect(fetch.mock.calls[1][0]).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef`
    );
    expect(fetch.mock.calls[1][1]?.method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toEqual({
      name: agentVersion.name,
      model: agentVersion.model,
      providerId: agentVersion.providerId,
      memoryInjectionEnabled: agentVersion.memoryInjectionEnabled,
      tools: agentVersion.tools,
      instructions: agentVersion.instructions,
      metadata: agentVersion.metadata,
      mcpConnectionIds: agentVersion.mcpConnectionIds,
    });
  });

  it("update PUTs /v1/agents/:id", async () => {
    const { fetch, calls } = createMockFetch({
      body: agentRow({ name: "Renamed" }),
    });
    const c = client(fetch);
    const agent = await c.agents.update("ag_0123456789abcdef", {
      name: "Renamed",
    });
    expect(agent.name).toBe("Renamed");
    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef`);
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      name: "Renamed",
    });
  });

  it.each([
    ["disable", "disabled"],
    ["enable", "active"],
  ] as const)(
    "%s posts the lifecycle verb and parses the Agent",
    async (verb, status) => {
      const { fetch, calls } = createMockFetch({ body: agentRow({ status }) });

      await expect(
        client(fetch).agents[verb]("ag_0123456789abcdef")
      ).resolves.toMatchObject({ status });
      expect(calls[0].url).toBe(
        `${BASE}/v1/agents/ag_0123456789abcdef/${verb}`
      );
      expect(calls[0].init?.method).toBe("POST");
    }
  );

  it("lists and updates MCP Attachment settings", async () => {
    const timestamp = "2026-07-15T00:00:00.000Z";
    const attachment = {
      createdAt: timestamp,
      forwardUserId: false,
      forwardedMetadataKeys: [],
      mcpConnectionId: "mcp_0123456789abcdef",
      updatedAt: timestamp,
    };
    const listed = createMockFetch({
      body: { mcpAttachments: [attachment] },
    });
    const updated = createMockFetch({
      body: {
        ...attachment,
        forwardUserId: true,
        forwardedMetadataKeys: ["locale"],
      },
    });

    await expect(
      client(listed.fetch).agents.listMcpAttachments("ag_0123456789abcdef")
    ).resolves.toEqual({ mcpAttachments: [attachment] });
    await expect(
      client(updated.fetch).agents.updateMcpAttachment(
        "ag_0123456789abcdef",
        attachment.mcpConnectionId,
        { forwardUserId: true, forwardedMetadataKeys: ["locale"] }
      )
    ).resolves.toMatchObject({
      forwardUserId: true,
      forwardedMetadataKeys: ["locale"],
    });
    expect(listed.calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/mcp-attachments`
    );
    expect(updated.calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef/mcp-attachments/${attachment.mcpConnectionId}`
    );
    expect(updated.calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(updated.calls[0].init?.body as string)).toEqual({
      forwardUserId: true,
      forwardedMetadataKeys: ["locale"],
    });
  });

  it("threads explicit Workspace sharing and reassignment through Agent writes", async () => {
    const sharedWorkspaceId = "ws_0123456789abcdef";
    const replacementWorkspaceId = "ws_fedcba9876543210";
    const { fetch, calls } = createMockFetch({
      body: agentRow({ workspaceId: replacementWorkspaceId }),
    });
    const c = client(fetch);
    await c.agents.create({
      name: "Shared Workspace",
      workspaceId: sharedWorkspaceId,
    });
    await c.agents.update("ag_0123456789abcdef", {
      workspaceId: replacementWorkspaceId,
    });

    expect(JSON.parse(calls[0].init?.body as string).workspaceId).toBe(
      sharedWorkspaceId
    );
    expect(JSON.parse(calls[1].init?.body as string).workspaceId).toBe(
      replacementWorkspaceId
    );
  });

  it("delete DELETEs /v1/agents/:id and resolves on 204", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });
    const c = client(fetch);
    await c.agents.delete("ag_0123456789abcdef", false);
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef?includeArtifacts=false`
    );
  });

  it("uploads an avatar as multipart without setting its content type", async () => {
    const { fetch, calls } = createMockFetch({
      body: agentRow({ avatarUrl: "https://signed.example/avatar" }),
    });
    const avatar = await client(fetch).agents.uploadAvatar(
      "ag_0123456789abcdef",
      new File(["image"], "avatar.png", { type: "image/png" })
    );
    expect(avatar.avatarUrl).toBe("https://signed.example/avatar");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef/avatar`);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeInstanceOf(FormData);
    expect(
      ((calls[0].init as RequestInit).body as FormData).get("file")
    ).toBeInstanceOf(File);
    expect(
      new Headers((calls[0].init as RequestInit).headers).has("content-type")
    ).toBe(false);
  });

  it("removes an avatar and parses the shared agent contract", async () => {
    const { fetch, calls } = createMockFetch({
      body: agentRow({ avatarUrl: null }),
    });
    const avatar = await client(fetch).agents.removeAvatar(
      "ag_0123456789abcdef"
    );
    expect(avatar.avatarUrl).toBeNull();
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef/avatar`);
  });

  it("surfaces 404 as BlazingAgentsError not_found", async () => {
    const { fetch } = createMockFetch({
      status: 404,
      text: errorEnvelope("not_found", "Agent not found"),
    });
    const c = client(fetch);
    await expect(c.agents.get("ag_x")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("rejects malformed response shapes (parse-on-read)", async () => {
    const { fetch } = createMockFetch({ body: { wrong: "shape" } });
    const c = client(fetch);
    await expect(c.agents.get("ag_x")).rejects.toBeDefined();
  });

  it("rejects a detached Agent response", async () => {
    const { fetch } = createMockFetch({
      body: agentRow({ workspaceId: null }),
    });
    await expect(
      client(fetch).agents.get("ag_0123456789abcdef")
    ).rejects.toBeDefined();
  });
});
