import { z } from "zod";

/**
 * Agent tools are toggled one by one. A category only groups tools for
 * display; it never enables anything on its own.
 */
export const AGENT_TOOL_CATEGORIES = [
  {
    id: "files",
    name: "File operations",
    description:
      "Read, write, edit, search, and run shell commands in the attached Workspace.",
  },
  {
    id: "planning",
    name: "Task planning",
    description:
      "Create and manage a structured todo list to plan and track multi-step work.",
  },
  {
    id: "memory",
    name: "Memory",
    description:
      "Save, recall, search, update, and delete durable notes owned by this Agent.",
  },
  {
    id: "web",
    name: "Web",
    description: "Search the public web for current information.",
  },
] as const;

export type AgentToolCategoryId = (typeof AGENT_TOOL_CATEGORIES)[number]["id"];

export interface AgentToolDefinition {
  category: AgentToolCategoryId;
  description: string;
  name: string;
  /** The tool runs in the Agent's attached Workspace. */
  requiresWorkspace: boolean;
}

export const AGENT_TOOLS = [
  {
    name: "read",
    category: "files",
    requiresWorkspace: true,
    description: "Read a file from the Workspace.",
  },
  {
    name: "write",
    category: "files",
    requiresWorkspace: true,
    description: "Create or overwrite a file in the Workspace.",
  },
  {
    name: "edit",
    category: "files",
    requiresWorkspace: true,
    description: "Replace exact text in a Workspace file.",
  },
  {
    name: "grep",
    category: "files",
    requiresWorkspace: true,
    description: "Search Workspace file contents with a regular expression.",
  },
  {
    name: "glob",
    category: "files",
    requiresWorkspace: true,
    description: "Find Workspace files by path pattern.",
  },
  {
    name: "bash",
    category: "files",
    requiresWorkspace: true,
    description: "Run shell commands in the Workspace.",
  },
  {
    name: "publish_artifacts",
    category: "files",
    requiresWorkspace: true,
    description: "Publish Workspace files as downloadable Artifacts.",
  },
  {
    name: "write_todos",
    category: "planning",
    requiresWorkspace: false,
    description: "Plan and track multi-step work with a todo list.",
  },
  {
    name: "save_memory",
    category: "memory",
    requiresWorkspace: false,
    description: "Save a durable note.",
  },
  {
    name: "get_memory",
    category: "memory",
    requiresWorkspace: false,
    description: "Read one saved note.",
  },
  {
    name: "search_memories",
    category: "memory",
    requiresWorkspace: false,
    description: "Search saved notes.",
  },
  {
    name: "update_memory",
    category: "memory",
    requiresWorkspace: false,
    description: "Update a saved note.",
  },
  {
    name: "delete_memory",
    category: "memory",
    requiresWorkspace: false,
    description: "Delete a saved note.",
  },
  {
    name: "web_search",
    category: "web",
    requiresWorkspace: false,
    description:
      "Search the public web for current results. Each search consumes Usage credit.",
  },
] as const satisfies readonly AgentToolDefinition[];

export type AgentToolName = (typeof AGENT_TOOLS)[number]["name"];

export const agentToolNames: readonly AgentToolName[] = AGENT_TOOLS.map(
  (tool) => tool.name
);

/** Built-in tool names an approval policy can reference. */
export const builtinToolNames = [...agentToolNames, "activate_skill"] as const;

const RESERVED_CHAT_FUNCTION_NAMES: ReadonlySet<string> = new Set(
  builtinToolNames
);

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
