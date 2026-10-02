import { describe, expect, it } from "vitest";
import {
  agentConfigSchema,
  agentSchema,
  agentStatusSchema,
  agentsListQuerySchema,
  agentsResponseSchema,
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
  thinkingLevel: null,
  autoCompaction: true,
  approvalInChat: { default: "full", overrides: [] },
  approvalInTasks: { default: "full", overrides: [] },
  compactionReserveTokens: 16_384,
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
};

const baseAgentConfig = {
  name: "Builder",
  model: "openrouter/test-model",
  providerId,
  thinkingLevel: null,
  autoCompaction: true,
  approvalInChat: { default: "full", overrides: [] },
  approvalInTasks: { default: "full", overrides: [] },
  compactionReserveTokens: 16_384,
  memoryInjectionEnabled: false,
  tools: [],
  instructions: "Build carefully.",
  metadata: {},
  mcpConnectionIds: [],
};

describe("Agent current and config contracts", () => {
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

    expect(agentConfigSchema.safeParse(baseAgentConfig).success).toBe(true);
    expect(
      agentConfigSchema.safeParse({
        ...baseAgentConfig,
        model: null,
        providerId: null,
      }).success
    ).toBe(true);
    expect(
      agentConfigSchema.safeParse({ ...baseAgentConfig, providerId: null })
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

  it.each(["sandboxId", "skills"])("strips retired field %s", (field) => {
    expect(
      agentSchema.parse({
        ...baseAgent,
        [field]: field === "skills" ? [] : null,
      })
    ).not.toHaveProperty(field);
  });

  it("keeps identity, Workspace, and Skills outside saved configurations", () => {
    expect(agentConfigSchema.parse(baseAgentConfig)).toEqual(baseAgentConfig);
    expect(
      agentConfigSchema.parse({ ...baseAgentConfig, workspaceId })
    ).not.toHaveProperty("workspaceId");
    expect(
      agentConfigSchema.parse({ ...baseAgentConfig, skills: [] })
    ).not.toHaveProperty("skills");
    expect(
      agentConfigSchema.parse({
        ...baseAgentConfig,
        agentId,
        tenantId,
        version: 1,
      })
    ).toEqual(baseAgentConfig);
  });

  it("validates saved provider, tools, and MCP attachments", () => {
    expect(
      agentConfigSchema.safeParse({
        ...baseAgentConfig,
        providerId,
        tools: ["workspace"],
        mcpConnectionIds: [mcpConnectionId],
      }).success
    ).toBe(true);
  });
});

describe("Agent list and lifecycle contracts", () => {
  it("filters current Agents by Attribution or Workspace", () => {
    expect(agentsListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      agentsListQuerySchema.parse({ userId: "u-42", workspaceId })
    ).toEqual({ limit: 50, userId: "u-42", workspaceId });
    expect(
      agentsListQuerySchema.safeParse({ workspaceId: "sb_xxxxxxxxxxxxxxxx" })
        .success
    ).toBe(false);
  });

  it("accepts only active and disabled lifecycle states", () => {
    expect(agentStatusSchema.options).toEqual(["active", "disabled"]);
    expect(agentStatusSchema.safeParse("archived").success).toBe(false);
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
      thinkingLevel: null,
      autoCompaction: true,
      approvalInChat: { default: "full", overrides: [] },
      approvalInTasks: { default: "full", overrides: [] },
      compactionReserveTokens: 16_384,
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

  it("accepts ordinary configuration updates", () => {
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

describe("additive Agent response fields", () => {
  it("strips new envelope and Agent fields while retaining known configuration", () => {
    expect(
      agentsResponseSchema.parse({
        data: [{ ...baseAgent, thinkingLevel: "high", futureSetting: true }],
        nextCursor: null,
        revision: 2,
      })
    ).toEqual({
      data: [{ ...baseAgent, thinkingLevel: "high" }],
      nextCursor: null,
    });
  });

  it("still rejects missing required fields and malformed known fields", () => {
    expect(
      agentsResponseSchema.safeParse({
        data: [{ ...baseAgent, name: undefined }],
        nextCursor: null,
      }).success
    ).toBe(false);
    expect(
      agentsResponseSchema.safeParse({
        data: [{ ...baseAgent, thinkingLevel: 42 }],
        nextCursor: null,
      }).success
    ).toBe(false);
    expect(
      agentsResponseSchema.safeParse({
        data: [{ ...baseAgent, tools: ["future-tool"] }],
        nextCursor: null,
      }).success
    ).toBe(false);
    expect(
      createAgentBodySchema.safeParse({ name: "Builder", futureSetting: true })
        .success
    ).toBe(false);
  });
});

describe("Agent automatic compaction", () => {
  it("enables compaction by default and accepts an explicit reserve", () => {
    expect(
      createAgentBodySchema.parse({ name: "Long conversation" })
    ).toMatchObject({
      autoCompaction: true,
      approvalInChat: { default: "full", overrides: [] },
      approvalInTasks: { default: "full", overrides: [] },
      compactionReserveTokens: 16_384,
    });
    expect(
      updateAgentBodySchema.parse({
        autoCompaction: false,
        compactionReserveTokens: 32_000,
      })
    ).toEqual({
      autoCompaction: false,
      compactionReserveTokens: 32_000,
    });
    for (const compactionReserveTokens of [
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        updateAgentBodySchema.safeParse({ compactionReserveTokens }).success
      ).toBe(false);
    }
  });
});
