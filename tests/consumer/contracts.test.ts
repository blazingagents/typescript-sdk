import type {
  ApprovalDecision,
  ApprovalPolicy,
  CreateAgentBody,
  CreateChatConnectionBody,
  ToolApprovalState,
  ToolReference,
  UpdateAgentBody,
} from "@blazingagents/sdk";
import {
  apiKeyTokenSchema,
  approvalPolicySchema,
  createChatConnectionBodySchema,
  isAdminAgentId,
  jsonSchemaShapeSchema,
  metadataSchema,
  promptIdSchema,
  promptVariablesSchema,
  sessionIdSchema,
  type ToolApprovalDecisionResponse,
  type ToolApprovalsResponse,
  toolReferenceSchema,
  type UsageSummary,
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
      continuationId: "tool-approval:message-1",
      state: "queued",
    } satisfies ToolApprovalDecisionResponse;
    type HasUsageAgentId = UsageSummary extends { agentId: string }
      ? true
      : false;
    const hasUsageAgentId: HasUsageAgentId = true;

    expect(approvals.data).toEqual([]);
    expect(decision.state).toBe("queued");
    expect(hasUsageAgentId).toBe(true);
  });
});

it("exports Chat Connection input types and runtime contracts", () => {
  const body: CreateChatConnectionBody = {
    agentId: "ag_0123456789abcdef",
    name: "Support",
    platform: "telegram",
    configuration: {
      botId: "123",
      webhookUrl: "https://api.example.com/callback",
    },
    credentials: { botToken: "123:token", webhookSecret: "secret" },
  };
  expect(createChatConnectionBodySchema.parse(body)).toMatchObject({
    enabled: true,
    configuration: { chatIds: [] },
  });
});
