import { z } from "zod";
import { mcpConnectionIdSchema } from "../ids.ts";
import { AGENT_TOOL_CATALOG } from "./agent-tools.ts";

export const approvalDecisionSchema = z.enum([
  "full",
  "deny",
  "manual",
  "auto",
]);
export const toolReferenceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("builtin"),
      name: z.enum([
        ...AGENT_TOOL_CATALOG.flatMap((group) => group.tools),
        "activate_skill",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("mcp"),
      connectionId: mcpConnectionIdSchema,
      name: z.string().min(1),
    })
    .strict(),
]);

export const approvalPolicySchema = z
  .object({
    default: approvalDecisionSchema,
    overrides: z
      .array(
        z
          .object({
            tool: toolReferenceSchema,
            decision: approvalDecisionSchema,
          })
          .strict()
      )
      .default([]),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const seen = new Set<string>();
    for (const [index, rule] of policy.overrides.entries()) {
      const key = JSON.stringify(rule.tool);
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "Tool overrides must be unique within each policy.",
          path: ["overrides", index, "tool"],
        });
      }
      seen.add(key);
    }
  });

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export type ToolReference = z.infer<typeof toolReferenceSchema>;

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
