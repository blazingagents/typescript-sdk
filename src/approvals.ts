import { isToolUIPart, type UIMessage } from "ai";
import type { ToolApprovalDecision } from "./contracts/entities/sessions.ts";

/**
 * Extracts approval decisions from the last assistant step without changing the message.
 * @returns Decisions after the last step-start part, or an empty array.
 */
export function extractApprovalDecisions(
  message: UIMessage
): ToolApprovalDecision[] {
  const lastStep = message.parts.findLastIndex(
    (part) => part.type === "step-start"
  );
  return message.parts.slice(lastStep + 1).flatMap((part) =>
    isToolUIPart(part) && part.state === "approval-responded"
      ? [
          {
            approvalId: part.approval.id,
            approved: part.approval.approved,
            ...(part.approval.reason === undefined
              ? {}
              : { reason: part.approval.reason }),
          },
        ]
      : []
  );
}
