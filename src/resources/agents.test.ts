import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { agentRow, createMockFetch, errorEnvelope } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.agents", () => {
  it("serializes policies, preserves omitted updates, and parses read responses", async () => {
    const policies = {
      approvalInChat: {
        default: "auto",
        overrides: [
          {
            tool: {
              type: "mcp",
              connectionId: "mcp_0123456789abcdef",
              name: "send_mail",
            },
            decision: "manual",
          },
        ],
      },
      approvalInTasks: { default: "deny", overrides: [] },
    } as const;
    const body = agentRow(policies);
    const { fetch, calls } = createMockFetch({ body });
    const c = client(fetch);
    // Input arrays are mutable; use a fresh policy for requests.
    const input = {
      approvalInChat: {
        default: "auto" as const,
        overrides: [...policies.approvalInChat.overrides],
      },
      approvalInTasks: { default: "deny" as const },
    };
    await expect(
      c.agents.create({ name: "Review", ...input })
    ).resolves.toMatchObject(policies);
    await expect(
      c.agents.update({ agentId: "ag_0123456789abcdef", ...input })
    ).resolves.toMatchObject(policies);
    await expect(
      c.agents.get({ agentId: "ag_0123456789abcdef" })
    ).resolves.toMatchObject(policies);
    await c.agents.update({
      agentId: "ag_0123456789abcdef",
      approvalInChat: { default: "full", overrides: [] },
    });
    await c.agents.update({ agentId: "ag_0123456789abcdef", name: "Renamed" });
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      name: "Review",
      ...input,
    });
    expect(JSON.parse(calls[1].init?.body as string)).toEqual(input);
    expect(JSON.parse(calls[3].init?.body as string)).toEqual({
      approvalInChat: { default: "full", overrides: [] },
    });
    expect(JSON.parse(calls[4].init?.body as string)).toEqual({
      name: "Renamed",
    });
    const listed = createMockFetch({
      body: { data: [body], nextCursor: null },
    });
    await expect(client(listed.fetch).agents.list()).resolves.toMatchObject({
      data: [policies],
    });
  });

  it.each([null, "off", "max", "custom-level"])(
    "round-trips thinking %s and preserves omission",
    async (thinkingLevel) => {
      const { fetch, calls } = createMockFetch({
        body: agentRow({ thinkingLevel }),
      });
      const c = client(fetch);
      expect(
        (
          await c.agents.create({
            name: "Thinking",
            model: "openrouter/test",
            providerId: "prv_0123456789abcdef",
            thinkingLevel,
          })
        ).thinkingLevel
      ).toBe(thinkingLevel);
      await c.agents.update({ agentId: "ag_0123456789abcdef", thinkingLevel });
      await c.agents.update({
        agentId: "ag_0123456789abcdef",
        name: "Renamed",
      });
      expect(JSON.parse(calls[0].init?.body as string).thinkingLevel).toBe(
        thinkingLevel
      );
      expect(JSON.parse(calls[1].init?.body as string)).toEqual({
        thinkingLevel,
      });
      expect(JSON.parse(calls[2].init?.body as string)).not.toHaveProperty(
        "thinkingLevel"
      );
    }
  );

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

  it.each(["core", "plus"] as const)(
    "create sends the %s automatic Workspace tier",
    async (workspaceTier) => {
      const { fetch, calls } = createMockFetch({ body: agentRow() });
      await client(fetch).agents.create({ name: "Builder", workspaceTier });
      expect(JSON.parse(calls[0].init?.body as string)).toEqual({
        name: "Builder",
        workspaceTier,
      });
    }
  );

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
        autoCompaction: false,
        compactionReserveTokens: 32_000,
        memoryInjectionEnabled: true,
      })
    ).resolves.toMatchObject({ memoryInjectionEnabled: true });
    await expect(
      client(updated.fetch).agents.update({
        agentId: "ag_0123456789abcdef",
        memoryInjectionEnabled: false,
      })
    ).resolves.toMatchObject({ memoryInjectionEnabled: false });

    expect(JSON.parse(created.calls[0].init?.body as string)).toMatchObject({
      autoCompaction: false,
      compactionReserveTokens: 32_000,
      memoryInjectionEnabled: true,
    });
    expect(JSON.parse(updated.calls[0].init?.body as string)).toEqual({
      memoryInjectionEnabled: false,
    });
  });

  it("list gets /v1/agents and parses { data: [...] }", async () => {
    const { fetch } = createMockFetch({
      body: { data: [agentRow()], nextCursor: null },
    });
    const c = client(fetch);
    const result = await c.agents.list();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("ag_0123456789abcdef");
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
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).agents.list(options);
    expect(calls[0].url).toBe(expectedUrl);
  });

  it("get gets /v1/agents/:id", async () => {
    const { fetch, calls } = createMockFetch({ body: agentRow() });
    const c = client(fetch);
    const agent = await c.agents.get({ agentId: "ag_0123456789abcdef" });
    expect(agent.id).toBe("ag_0123456789abcdef");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/ag_0123456789abcdef`);
  });

  it("update PUTs /v1/agents/:id", async () => {
    const { fetch, calls } = createMockFetch({
      body: agentRow({ name: "Renamed" }),
    });
    const c = client(fetch);
    const agent = await c.agents.update({
      agentId: "ag_0123456789abcdef",
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
        client(fetch).agents[verb]({ agentId: "ag_0123456789abcdef" })
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
      client(listed.fetch).agents.listMcpAttachments({
        agentId: "ag_0123456789abcdef",
      })
    ).resolves.toEqual({ mcpAttachments: [attachment] });
    await expect(
      client(updated.fetch).agents.updateMcpAttachment({
        agentId: "ag_0123456789abcdef",
        mcpConnectionId: attachment.mcpConnectionId,
        forwardUserId: true,
        forwardedMetadataKeys: ["locale"],
      })
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
    await c.agents.update({
      agentId: "ag_0123456789abcdef",
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
    await c.agents.delete({
      agentId: "ag_0123456789abcdef",
      includeArtifacts: false,
    });
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/ag_0123456789abcdef?includeArtifacts=false`
    );
  });

  it("uploads an avatar as multipart without setting its content type", async () => {
    const { fetch, calls } = createMockFetch({
      body: agentRow({ avatarUrl: "https://signed.example/avatar" }),
    });
    const avatar = await client(fetch).agents.uploadAvatar({
      agentId: "ag_0123456789abcdef",
      file: new File(["image"], "avatar.png", { type: "image/png" }),
    });
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
    const avatar = await client(fetch).agents.removeAvatar({
      agentId: "ag_0123456789abcdef",
    });
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
    await expect(c.agents.get({ agentId: "ag_x" })).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("rejects malformed response shapes (parse-on-read)", async () => {
    const { fetch } = createMockFetch({ body: { wrong: "shape" } });
    const c = client(fetch);
    await expect(c.agents.get({ agentId: "ag_x" })).rejects.toBeDefined();
  });

  it("rejects a detached Agent response", async () => {
    const { fetch } = createMockFetch({
      body: agentRow({ workspaceId: null }),
    });
    await expect(
      client(fetch).agents.get({ agentId: "ag_0123456789abcdef" })
    ).rejects.toBeDefined();
  });
});
