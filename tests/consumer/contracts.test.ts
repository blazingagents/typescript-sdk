import type {
  ApprovalDecision,
  ApprovalPolicy,
  CreateAgentBody,
  CreateChatConnectionBody,
  CreateWorkspaceBody,
  ToolApprovalState,
  ToolReference,
  UpdateAgentBody,
  WorkspaceTier,
} from "@blazingagents/sdk";
import {
  apiKeyTokenSchema,
  approvalPolicySchema,
  type ContinueToolApprovalsBody,
  createAgentBodySchema,
  createChatConnectionBodySchema,
  createWorkspaceBodySchema,
  isAdminAgentId,
  jsonSchemaShapeSchema,
  metadataSchema,
  promptIdSchema,
  promptVariablesSchema,
  sessionIdSchema,
  type ToolApprovalsResponse,
  toolReferenceSchema,
  type UsageOverviewResponse,
  type UsageSummary,
  updateWorkspaceBodySchema,
  workspaceTierSchema,
} from "@blazingagents/sdk/contracts";
import { describe, expect, it } from "vitest";

describe("installed SDK contracts", () => {
  it("exports approval schemas and distinguishes input policies from parsed output", () => {
    const decision: ApprovalDecision = "manual";
    const tool: ToolReference = {
      type: "mcp",
      connectionId: "mcp_0123456789abcdef",
      name: "send_mail",
    };
    const create: CreateAgentBody = {
      name: "Agent",
      approvalInChat: { default: decision },
    };
    const update: UpdateAgentBody = { approvalInTasks: { default: "deny" } };
    const policy: ApprovalPolicy = approvalPolicySchema.parse(
      create.approvalInChat
    );
    const approval: ToolApprovalState = {
      approvalId: "approval-1",
      tool,
      toolCallId: "call-1",
      toolName: "runtime_mail",
      decision: "pending",
      reason: null,
      input: {},
      decidedAt: null,
    };
    expect(policy).toEqual({ default: "manual", overrides: [] });
    expect(update.approvalInTasks).toEqual({ default: "deny" });
    expect(toolReferenceSchema.parse(approval.tool)).toEqual(tool);
  });

  it("exports the curated runtime contract entry point", () => {
    expect(sessionIdSchema.parse("ss_0123456789abcdef")).toBe(
      "ss_0123456789abcdef"
    );
    expect(promptIdSchema.parse("prompt_0123456789abcdef")).toBe(
      "prompt_0123456789abcdef"
    );
    expect(apiKeyTokenSchema.parse(`ba_${"a".repeat(40)}`)).toHaveLength(43);
    expect(isAdminAgentId("ag_adm0123456789ABC")).toBe(true);
    expect(metadataSchema.parse({ source: "cli" })).toEqual({ source: "cli" });
    expect(promptVariablesSchema.parse({ topic: "release" })).toEqual({
      topic: "release",
    });
    expect(jsonSchemaShapeSchema.parse({ type: "object" })).toEqual({
      type: "object",
    });
  });

  it("exports CLI transport types", () => {
    const approvals = {
      data: [],
      continuation: null,
    } satisfies ToolApprovalsResponse;
    const decision = {
      decisions: [{ approvalId: "approval-1", approved: true }],
    } satisfies ContinueToolApprovalsBody;
    type HasUsageAgentId = UsageSummary extends { agentId: string }
      ? true
      : false;
    const hasUsageAgentId: HasUsageAgentId = true;

    expect(approvals.data).toEqual([]);
    expect(decision.decisions[0].approved).toBe(true);
    expect(hasUsageAgentId).toBe(true);
  });

  it("exports the usage overview contract", () => {
    const overview = {
      totals: {
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        durationMs: 0,
      },
      daily: [],
      byAgent: [],
      byUser: [],
      byModel: [],
      activeAgentCount: 0,
    } satisfies UsageOverviewResponse;

    expect(overview.activeAgentCount).toBe(0);
  });
});

it("exports Chat Connection input types and runtime contracts", () => {
  const body: CreateChatConnectionBody = {
    agentId: "ag_0123456789abcdef",
    name: "Support",
    platform: "telegram",
    configuration: {
      businessMode: false,
    },
    credentials: { botToken: "123:token" },
  };
  expect(createChatConnectionBodySchema.parse(body)).toMatchObject({
    enabled: true,
    configuration: { chatIds: [] },
  });
});

it("exports immutable Core and Plus Workspace contracts", () => {
  const tier: WorkspaceTier = "plus";
  const workspace: CreateWorkspaceBody = { tier };
  const agent: CreateAgentBody = { name: "Builder", workspaceTier: tier };
  expect(workspaceTierSchema.options).toEqual(["core", "plus"]);
  expect(createWorkspaceBodySchema.parse({}).tier).toBe("core");
  expect(createWorkspaceBodySchema.parse(workspace).tier).toBe(tier);
  expect(createAgentBodySchema.parse(agent).workspaceTier).toBe(tier);
  expect(
    createAgentBodySchema.safeParse({
      ...agent,
      workspaceId: "ws_0123456789abcdef",
    }).success
  ).toBe(false);
  expect(updateWorkspaceBodySchema.safeParse({ tier }).success).toBe(false);
});
