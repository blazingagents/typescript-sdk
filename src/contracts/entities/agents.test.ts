import { describe, expect, it } from "vitest";
import {
  agentSchema,
  agentStatusSchema,
  agentsListQuerySchema,
  agentVersionNumberSchema,
  agentVersionSchema,
  agentVersionsListQuerySchema,
  agentVersionsResponseSchema,
  createAgentBodySchema,
  updateAgentBodySchema,
} from "./agents.ts";

const tenantId = "ten_xxxxxxxxxxxxxxxx";
const agentId = "ag_xxxxxxxxxxxxxxxx";
const providerId = "prv_xxxxxxxxxxxxxxxx";
const workspaceId = "ws_xxxxxxxxxxxxxxxx";
const mcpConnectionId = "mcp_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";

const baseAgent = {
  createdAt: iso,
  id: agentId,
  tenantId,
  model: "openrouter/test-model",
  name: "Builder",
  providerId,
  workspaceId,
  memoryInjectionEnabled: false,
  tools: [],
  instructions: "Build carefully.",
  userId: "",
  metadata: {},
  mcpConnectionIds: [],
  updatedAt: iso,
  avatarUrl: null,
  status: "active",
  version: 1,
};

const baseAgentVersion = {
  agentId,
  tenantId,
  version: 1,
  name: "Builder",
  model: "openrouter/test-model",
  providerId,
  memoryInjectionEnabled: false,
  tools: [],
  instructions: "Build carefully.",
  metadata: {},
  mcpConnectionIds: [],
  createdAt: iso,
};

describe("Agent current and Version contracts", () => {
  it("accepts configured and unconfigured Provider-model pairs only", () => {
    expect(agentSchema.safeParse(baseAgent).success).toBe(true);
    expect(
      agentSchema.safeParse({ ...baseAgent, model: null, providerId: null })
        .success
    ).toBe(true);
    expect(
      agentSchema.safeParse({ ...baseAgent, providerId: null }).success
    ).toBe(false);
    expect(agentSchema.safeParse({ ...baseAgent, model: null }).success).toBe(
      false
    );

    expect(agentVersionSchema.safeParse(baseAgentVersion).success).toBe(true);
    expect(
      agentVersionSchema.safeParse({
        ...baseAgentVersion,
        model: null,
        providerId: null,
      }).success
    ).toBe(true);
    expect(
      agentVersionSchema.safeParse({ ...baseAgentVersion, providerId: null })
        .success
    ).toBe(false);
  });

  it("requires the current Workspace attachment", () => {
    expect(agentSchema.parse(baseAgent)).toEqual(baseAgent);
    expect(
      agentSchema.safeParse({ ...baseAgent, workspaceId: null }).success
    ).toBe(false);
    const { workspaceId: _workspaceId, ...withoutWorkspace } = baseAgent;
    expect(agentSchema.safeParse(withoutWorkspace).success).toBe(false);
  });

  it.each(["sandboxId", "skills"])("rejects retired field %s", (field) => {
    expect(
      agentSchema.safeParse({
        ...baseAgent,
        [field]: field === "skills" ? [] : null,
      }).success
    ).toBe(false);
  });

  it("keeps Workspace and Skills outside immutable Versions", () => {
    expect(agentVersionSchema.parse(baseAgentVersion)).toEqual(
      baseAgentVersion
    );
    expect(
      agentVersionSchema.safeParse({ ...baseAgentVersion, workspaceId }).success
    ).toBe(false);
    expect(
      agentVersionSchema.safeParse({ ...baseAgentVersion, skills: [] }).success
    ).toBe(false);
  });

  it("validates Versioned provider, tools, and MCP attachments", () => {
    expect(
      agentVersionSchema.safeParse({
        ...baseAgentVersion,
        providerId,
        tools: ["workspace"],
        mcpConnectionIds: [mcpConnectionId],
      }).success
    ).toBe(true);
  });
});

describe("Agent list and lifecycle contracts", () => {
  it("filters current Agents by Attribution or Workspace", () => {
    expect(agentsListQuerySchema.parse({})).toEqual({});
    expect(
      agentsListQuerySchema.parse({ userId: "u-42", workspaceId })
    ).toEqual({ userId: "u-42", workspaceId });
    expect(
      agentsListQuerySchema.safeParse({ workspaceId: "sb_xxxxxxxxxxxxxxxx" })
        .success
    ).toBe(false);
  });

  it("accepts only active and disabled lifecycle states", () => {
    expect(agentStatusSchema.options).toEqual(["active", "disabled"]);
    expect(agentStatusSchema.safeParse("archived").success).toBe(false);
  });

  it("accepts only positive signed int32 Version numbers", () => {
    expect(agentVersionNumberSchema.parse(1)).toBe(1);
    expect(agentVersionNumberSchema.parse(2_147_483_647)).toBe(2_147_483_647);
    for (const value of [0, -1, 1.5, 2_147_483_648]) {
      expect(agentVersionNumberSchema.safeParse(value).success).toBe(false);
    }
  });

  it("defines the standard Version page", () => {
    expect(agentVersionsListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      agentVersionsListQuerySchema.parse({ cursor: "opaque", limit: "200" })
    ).toEqual({ cursor: "opaque", limit: 200 });
    expect(
      agentVersionsResponseSchema.parse({
        data: [baseAgentVersion],
        nextCursor: null,
      })
    ).toEqual({ data: [baseAgentVersion], nextCursor: null });
  });
});

describe("Agent mutation contracts", () => {
  it("counts Unicode code points at the Agent name boundary", () => {
    expect(
      createAgentBodySchema.safeParse({ name: "😀".repeat(80) }).success
    ).toBe(true);
    expect(
      createAgentBodySchema.safeParse({ name: "😀".repeat(81) }).success
    ).toBe(false);
  });

  it("reports bad values and unknown keys together", () => {
    const result = createAgentBodySchema.safeParse({ name: 42, extra: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "invalid_type", path: ["name"] }),
          expect.objectContaining({ code: "unrecognized_keys", path: [] }),
        ])
      );
    }
  });

  it("accepts trimmed Provider-native model ids without requiring a slash", () => {
    expect(
      createAgentBodySchema.parse({
        name: "Builder",
        model: " gpt-4.1 ",
        providerId,
      }).model
    ).toBe("gpt-4.1");
  });

  it("omits Workspace attachment when implicit creation is requested", () => {
    expect(createAgentBodySchema.parse({ name: "Builder" })).toEqual({
      name: "Builder",
      model: null,
      providerId: null,
      memoryInjectionEnabled: false,
      tools: [],
      instructions: "",
      userId: "",
      metadata: {},
      mcpConnectionIds: [],
    });
  });

  it("accepts current Workspace attachment on create", () => {
    expect(
      createAgentBodySchema.parse({ name: "Builder", workspaceId }).workspaceId
    ).toBe(workspaceId);
    expect(
      createAgentBodySchema.safeParse({ name: "Builder", workspaceId: null })
        .success
    ).toBe(false);
  });

  it("accepts Workspace reassignment and rejects detachment on update", () => {
    expect(updateAgentBodySchema.parse({ workspaceId })).toEqual({
      workspaceId,
    });
    expect(updateAgentBodySchema.safeParse({ workspaceId: null }).success).toBe(
      false
    );
  });

  it("accepts ordinary versioned updates", () => {
    expect(
      updateAgentBodySchema.parse({
        model: "openrouter/test-model",
        tools: ["workspace"],
        memoryInjectionEnabled: true,
        providerId,
        mcpConnectionIds: [mcpConnectionId],
      })
    ).toEqual({
      model: "openrouter/test-model",
      tools: ["workspace"],
      memoryInjectionEnabled: true,
      providerId,
      mcpConnectionIds: [mcpConnectionId],
    });
  });

  it("accepts complete pair transitions and model-only replacement", () => {
    expect(
      createAgentBodySchema.safeParse({
        name: "Configured",
        model: "native-model",
        providerId,
      }).success
    ).toBe(true);
    expect(
      updateAgentBodySchema.safeParse({ model: "replacement-model" }).success
    ).toBe(true);
    expect(
      updateAgentBodySchema.safeParse({ model: null, providerId: null }).success
    ).toBe(true);
  });

  it("rejects half-configured creates and updates", () => {
    for (const body of [
      { name: "Model only", model: "native-model" },
      { name: "Provider only", providerId },
      { name: "Null model", model: null, providerId },
      { name: "Null provider", model: "native-model", providerId: null },
    ]) {
      expect(createAgentBodySchema.safeParse(body).success).toBe(false);
    }
    for (const body of [
      { model: null },
      { providerId: null },
      { providerId },
      { model: null, providerId },
      { model: "native-model", providerId: null },
    ]) {
      expect(updateAgentBodySchema.safeParse(body).success).toBe(false);
    }
  });

  it("rejects empty, lifecycle, Skill-selection, and Sandbox updates", () => {
    expect(updateAgentBodySchema.safeParse({}).success).toBe(false);
    expect(
      updateAgentBodySchema.safeParse({ status: "disabled" }).success
    ).toBe(false);
    expect(updateAgentBodySchema.safeParse({ skills: [] }).success).toBe(false);
    expect(updateAgentBodySchema.safeParse({ sandboxId: null }).success).toBe(
      false
    );
  });

  it("rejects duplicate and unknown Tool or MCP group values", () => {
    expect(
      createAgentBodySchema.safeParse({
        name: "Builder",
        tools: ["workspace", "workspace"],
      }).success
    ).toBe(false);
    expect(
      createAgentBodySchema.safeParse({
        name: "Builder",
        tools: ["file_operation_workspace"],
      }).success
    ).toBe(false);
    expect(
      createAgentBodySchema.safeParse({ name: "Builder", tools: ["shell"] })
        .success
    ).toBe(false);
    expect(
      createAgentBodySchema.safeParse({
        name: "Builder",
        mcpConnectionIds: [mcpConnectionId, mcpConnectionId],
      }).success
    ).toBe(false);
  });
});
