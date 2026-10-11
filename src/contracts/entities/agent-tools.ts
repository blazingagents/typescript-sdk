import { z } from "zod";

/** Tool groups an Agent can attach. File operations use its Workspace. */

export const agentToolGroupIds = [
  "workspace",
  "write_todos",
  "memory",
] as const;

export type AgentToolGroupId = (typeof agentToolGroupIds)[number];

export interface AgentToolGroup {
  description: string;
  id: AgentToolGroupId;
  name: string;
  tools: readonly string[];
}

export const AGENT_TOOL_CATALOG = [
  {
    id: "workspace",
    name: "File operations",
    description:
      "Read, write, edit, search, and run shell commands in the attached Workspace.",
    tools: [
      "read",
      "write",
      "edit",
      "grep",
      "glob",
      "bash",
      "publish_artifacts",
    ],
  },
  {
    id: "write_todos",
    name: "Task planning",
    description:
      "Create and manage a structured todo list to plan and track multi-step work.",
    tools: ["write_todos"],
  },
  {
    id: "memory",
    name: "Memory",
    description:
      "Save, recall, search, update, and delete durable notes owned by this Agent.",
    tools: [
      "save_memory",
      "get_memory",
      "search_memories",
      "update_memory",
      "delete_memory",
    ],
  },
] as const satisfies readonly AgentToolGroup[];

const RESERVED_CHAT_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  ...AGENT_TOOL_CATALOG.flatMap((group) => group.tools),
  "activate_skill",
]);

/**
 * A model-facing tool name. Built-in tool names and the `mcp__` prefix used
 * for MCP tools are reserved so a caller function never shadows them.
 */
export const chatFunctionNameSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .refine(
    (name) =>
      !(RESERVED_CHAT_FUNCTION_NAMES.has(name) || name.startsWith("mcp__")),
    { message: "Function name is reserved for a built-in or MCP tool." }
  );
