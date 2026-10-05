import type { UIMessage } from "ai";
import { expect, it } from "vitest";
import { extractApprovalDecisions } from "./approvals.ts";
import { chatSteerConsumedEventSchema } from "./contracts/entities/session-inputs.ts";
import { continueToolApprovalsBodySchema } from "./contracts/entities/sessions.ts";

const decision = {
  approvalId: "approval-1",
  approved: false,
  reason: "Keep it",
};
it("extracts only the last assistant step and preserves the message", () => {
  const message: UIMessage = {
    id: "assistant",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "bash",
        toolCallId: "old",
        state: "approval-responded",
        input: {},
        approval: { id: "old-approval", approved: true },
      },
      { type: "step-start" },
      { type: "text", text: "Review" },
      {
        type: "dynamic-tool",
        toolName: "bash",
        toolCallId: "call",
        state: "approval-responded",
        input: {},
        approval: {
          id: decision.approvalId,
          approved: decision.approved,
          reason: decision.reason,
        },
      },
    ],
  };
  const snapshot = structuredClone(message);
  expect(extractApprovalDecisions(message)).toEqual([decision]);
  expect(message).toEqual(snapshot);
  expect(
    extractApprovalDecisions({ id: "assistant", role: "assistant", parts: [] })
  ).toEqual([]);
});
it("validates nonempty full-round decisions and rejects duplicate approval identities", () => {
  expect(
    continueToolApprovalsBodySchema.parse({ decisions: [decision] })
  ).toEqual({ decisions: [decision] });
  for (const body of [
    { decisions: [] },
    { decisions: [decision, decision] },
    { decisions: [{ approved: true }] },
    { decisions: [decision], continuationId: "old" },
  ]) {
    expect(continueToolApprovalsBodySchema.safeParse(body).success).toBe(false);
  }
});
it("validates provisional steer placement without requiring a committed receipt", () => {
  const event = {
    type: "data-ba-steer-consumed",
    transient: true,
    data: {
      requestId: "request-1",
      turnId: "turn_0123456789abcdef",
      sequence: 1,
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Steer" }],
      },
    },
  };
  expect(chatSteerConsumedEventSchema.parse(event)).toEqual(event);
  expect(
    chatSteerConsumedEventSchema.safeParse({ ...event, transient: false })
      .success
  ).toBe(false);
});
