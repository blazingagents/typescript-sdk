import { describe, expect, it } from "vitest";
import {
  approvalDecisionSchema,
  approvalPolicySchema,
  toolReferenceSchema,
} from "./agent-approval.ts";
import { createAgentBodySchema, updateAgentBodySchema } from "./agents.ts";
import { toolApprovalStateSchema } from "./sessions.ts";

const tool = {
  type: "mcp",
  connectionId: "mcp_0123456789abcdef",
  name: "send_mail",
} as const;
const approval = {
  approvalId: "approval-1",
  decision: "pending",
  input: { to: "test@example.com" },
  reason: null,
  toolCallId: "call-1",
  toolName: "runtime_mail",
};

describe("approval contracts", () => {
  it.each(["full", "deny", "manual", "auto"])(
    "accepts policy mode %s",
    (decision) => {
      expect(
        approvalPolicySchema.parse({
          default: decision,
          overrides: [{ tool, decision }],
        })
      ).toEqual({ default: decision, overrides: [{ tool, decision }] });
    }
  );
  it("keeps policy modes separate from persisted decisions", () => {
    for (const decision of ["pending", "approved", "denied"]) {
      expect(approvalDecisionSchema.safeParse(decision).success).toBe(false);
    }
    for (const decision of approvalDecisionSchema.options) {
      expect(
        toolApprovalStateSchema.safeParse({ ...approval, decision }).success
      ).toBe(false);
    }
  });
  it("defaults creates and distinguishes omitted updates from replacement", () => {
    expect(createAgentBodySchema.parse({ name: "Agent" })).toMatchObject({
      approvalInChat: { default: "full", overrides: [] },
      approvalInTasks: { default: "full", overrides: [] },
    });
    expect(updateAgentBodySchema.parse({ name: "Renamed" })).toEqual({
      name: "Renamed",
    });
    for (const policy of [
      { default: "deny" },
      { default: "deny", overrides: [] },
    ]) {
      expect(updateAgentBodySchema.parse({ approvalInChat: policy })).toEqual({
        approvalInChat: { default: "deny", overrides: [] },
      });
    }
    expect(
      updateAgentBodySchema.safeParse({ approvalInTasks: null }).success
    ).toBe(false);
  });
  it("validates exact structured identities and rejects duplicate overrides", () => {
    expect(toolReferenceSchema.parse(tool)).toEqual(tool);
    expect(
      toolReferenceSchema.parse({ type: "builtin", name: "activate_skill" })
    ).toEqual({ type: "builtin", name: "activate_skill" });
    for (const invalid of [
      { ...tool, connectionId: "bad" },
      { ...tool, name: "" },
      { ...tool, extra: true },
      { type: "builtin", name: "unknown" },
    ]) {
      expect(toolReferenceSchema.safeParse(invalid).success).toBe(false);
    }
    const rule = { tool, decision: "manual" };
    const result = approvalPolicySchema.safeParse({
      default: "full",
      overrides: [rule, rule],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["overrides", 1, "tool"]);
    }
    expect(
      approvalPolicySchema.safeParse({
        default: "full",
        overrides: [
          rule,
          { ...rule, tool: { ...tool, connectionId: "mcp_fedcba9876543210" } },
        ],
      }).success
    ).toBe(true);
  });
  it("preserves approval metadata with exact optionality and nullability", () => {
    expect(toolApprovalStateSchema.parse(approval)).toEqual(approval);
    const metadata = {
      tool,
      assistantMessageId: "assistant-1",
      createdAt: "2026-09-12T00:00:00Z",
      decidedAt: null,
    };
    expect(toolApprovalStateSchema.parse({ ...approval, ...metadata })).toEqual(
      { ...approval, ...metadata }
    );
    expect(
      toolApprovalStateSchema.parse({
        ...approval,
        tool: null,
        decidedAt: metadata.createdAt,
      })
    ).toMatchObject({ tool: null, decidedAt: metadata.createdAt });
    for (const invalid of [
      { assistantMessageId: null },
      { assistantMessageId: "" },
      { createdAt: null },
      { createdAt: "bad" },
      { decidedAt: "bad" },
    ]) {
      expect(
        toolApprovalStateSchema.safeParse({ ...approval, ...invalid }).success
      ).toBe(false);
    }
  });
});
