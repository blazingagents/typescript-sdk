import { z } from "zod";

/**
 * Agent tools are toggled one by one. A tag describes a tool; it never enables
 * anything on its own.
 *
 * Every tool has exactly one group tag, which display code groups tools by.
 */
export const AGENT_TOOL_GROUPS = [
  {
    tag: "files",
    name: "File operations",
    description:
      "Read, write, edit, search, and run shell commands in the attached Workspace.",
  },
  {
    tag: "planning",
    name: "Task planning",
    description:
      "Create and manage a structured todo list to plan and track multi-step work.",
  },
  {
    tag: "memory",
    name: "Memory",
    description:
      "Save, recall, search, update, and delete durable notes owned by this Agent.",
  },
  {
    tag: "web",
    name: "Web",
    description: "Search the public web for current information.",
  },
] as const;

export type AgentToolGroupTag = (typeof AGENT_TOOL_GROUPS)[number]["tag"];

/**
 * What a file operation tool may do to the Workspace. `file_read` tools never
 * change Workspace files, so an Agent limited to them is read-only.
 * `execute` runs arbitrary commands, which can change files and more.
 */
export const AGENT_TOOL_FILE_ACCESS_TAGS = [
  "file_read",
  "file_write",
  "execute",
] as const;

export type AgentToolFileAccessTag =
  (typeof AGENT_TOOL_FILE_ACCESS_TAGS)[number];

export const AGENT_TOOL_TAGS = [
  ...AGENT_TOOL_GROUPS.map((group) => group.tag),
  ...AGENT_TOOL_FILE_ACCESS_TAGS,
] as const;

export type AgentToolTag = AgentToolGroupTag | AgentToolFileAccessTag;

/** The group tag comes first; only a file operation tool adds a file access tag. */
export type AgentToolTags =
  | readonly ["files"]
  | readonly ["files", AgentToolFileAccessTag]
  | readonly [Exclude<AgentToolGroupTag, "files">];

/** @deprecated Use `AgentToolGroupTag`. */
export type AgentToolCategoryId = AgentToolGroupTag;

/** @deprecated Use `AGENT_TOOL_GROUPS`, keyed by `tag`. */
export const AGENT_TOOL_CATEGORIES: readonly {
  description: string;
  id: AgentToolGroupTag;
  name: string;
}[] = AGENT_TOOL_GROUPS.map(({ tag, ...group }) => ({ id: tag, ...group }));

export interface AgentToolDefinition {
  /** @deprecated Use the group tag in `tags`. */
  category: AgentToolGroupTag;
  description: string;
  name: string;
  /** The tool runs in the Agent's attached Workspace. */
  requiresWorkspace: boolean;
  tags: AgentToolTags;
}

export const AGENT_TOOLS = [
  {
    name: "read",
    tags: ["files", "file_read"],
    category: "files",
    requiresWorkspace: true,
    description: "Read a file from the Workspace.",
  },
  {
    name: "write",
    tags: ["files", "file_write"],
    category: "files",
    requiresWorkspace: true,
    description: "Create or overwrite a file in the Workspace.",
  },
  {
    name: "edit",
    tags: ["files", "file_write"],
    category: "files",
    requiresWorkspace: true,
    description: "Replace exact text in a Workspace file.",
  },
  {
    name: "grep",
    tags: ["files", "file_read"],
    category: "files",
    requiresWorkspace: true,
    description: "Search Workspace file contents with a regular expression.",
  },
  {
    name: "glob",
    tags: ["files", "file_read"],
    category: "files",
    requiresWorkspace: true,
    description: "Find Workspace files by path pattern.",
  },
  {
    name: "bash",
    tags: ["files", "execute"],
    category: "files",
    requiresWorkspace: true,
    description: "Run shell commands in the Workspace.",
  },
  {
    name: "publish_artifacts",
    tags: ["files"],
    category: "files",
    requiresWorkspace: true,
    description: "Publish Workspace files as downloadable Artifacts.",
  },
  {
    name: "write_todos",
    tags: ["planning"],
    category: "planning",
    requiresWorkspace: false,
    description: "Plan and track multi-step work with a todo list.",
  },
  {
    name: "save_memory",
    tags: ["memory"],
    category: "memory",
    requiresWorkspace: false,
    description: "Save a durable note.",
  },
  {
    name: "get_memory",
    tags: ["memory"],
    category: "memory",
    requiresWorkspace: false,
    description: "Read one saved note.",
  },
  {
    name: "search_memories",
    tags: ["memory"],
    category: "memory",
    requiresWorkspace: false,
    description: "Search saved notes.",
  },
  {
    name: "update_memory",
    tags: ["memory"],
    category: "memory",
    requiresWorkspace: false,
    description: "Update a saved note.",
  },
  {
    name: "delete_memory",
    tags: ["memory"],
    category: "memory",
    requiresWorkspace: false,
    description: "Delete a saved note.",
  },
  {
    name: "web_search",
    tags: ["web"],
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
