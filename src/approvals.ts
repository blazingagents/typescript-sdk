import { isToolUIPart, type UIMessage } from "ai";
import type { BlazingAgents } from "./client.ts";

interface ApprovalTarget {
  abortSignal?: AbortSignal;
  agentId: string;
  sessionId: string;
}

/**
 * Records each approval response in the assistant message's last step and
 * returns the continuation they decide, or `undefined` when there are none.
 */
export async function decideApprovalResponses(
  client: Pick<BlazingAgents, "sessions">,
  { message, ...target }: ApprovalTarget & { message: UIMessage }
): Promise<string | undefined> {
  const lastStep = message.parts.findLastIndex(
    (part) => part.type === "step-start"
  );
  let continuationId: string | undefined;
  for (const part of message.parts.slice(lastStep + 1)) {
    if (isToolUIPart(part) && part.state === "approval-responded") {
      ({ continuationId } = await client.sessions.decideToolApproval({
        ...target,
        approvalId: part.approval.id,
        approved: part.approval.approved,
        reason: part.approval.reason,
      }));
    }
  }
  return continuationId;
}
