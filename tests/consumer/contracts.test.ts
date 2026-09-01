import {
  apiKeyTokenSchema,
  isAdminAgentId,
  jsonSchemaShapeSchema,
  metadataSchema,
  promptIdSchema,
  promptVariablesSchema,
  sessionIdSchema,
  type ToolApprovalDecisionResponse,
  type ToolApprovalsResponse,
  type UsageSummary,
} from "@blazingagents/sdk/contracts";
import { describe, expect, it } from "vitest";

describe("installed SDK contracts", () => {
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
