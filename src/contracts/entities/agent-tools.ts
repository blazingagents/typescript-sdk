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
    description: "Search the public web and read pages by URL.",
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

/** The group tag comes first. Only a file operation tool adds a file access tag, and at most one. */
export type AgentToolTags = readonly [
  AgentToolGroupTag,
  ...AgentToolFileAccessTag[],
];

/** The catalog's exact tag shapes, checked where it is declared. */
type CatalogTags =
  | readonly ["files"]
  | readonly ["files", AgentToolFileAccessTag]
  | readonly [Exclude<AgentToolGroupTag, "files">];

export interface AgentToolDefinition {
  description: string;
  name: string;
  /** The tool runs in the Agent's attached Workspace. */
  requiresWorkspace: boolean;
  tags: AgentToolTags;
}

const CATALOG = [
  {
    name: "read",
    tags: ["files", "file_read"],
    requiresWorkspace: true,
    description: "Read a file from the Workspace.",
  },
  {
    name: "write",
    tags: ["files", "file_write"],
    requiresWorkspace: true,
    description: "Create or overwrite a file in the Workspace.",
  },
  {
    name: "edit",
    tags: ["files", "file_write"],
    requiresWorkspace: true,
    description: "Replace exact text in a Workspace file.",
  },
  {
    name: "grep",
    tags: ["files", "file_read"],
    requiresWorkspace: true,
    description: "Search Workspace file contents with a regular expression.",
  },
  {
    name: "glob",
    tags: ["files", "file_read"],
    requiresWorkspace: true,
    description: "Find Workspace files by path pattern.",
  },
  {
    name: "bash",
    tags: ["files", "execute"],
    requiresWorkspace: true,
    description: "Run shell commands in the Workspace.",
  },
  {
    name: "publish_artifacts",
    tags: ["files"],
    requiresWorkspace: true,
    description: "Publish Workspace files as downloadable Artifacts.",
  },
  {
    name: "write_todos",
    tags: ["planning"],
    requiresWorkspace: false,
    description: "Plan and track multi-step work with a todo list.",
  },
  {
    name: "save_memory",
    tags: ["memory"],
    requiresWorkspace: false,
    description: "Save a durable note.",
  },
  {
    name: "get_memory",
    tags: ["memory"],
    requiresWorkspace: false,
    description: "Read one saved note.",
  },
  {
    name: "search_memories",
    tags: ["memory"],
    requiresWorkspace: false,
    description: "Search saved notes.",
  },
  {
    name: "update_memory",
    tags: ["memory"],
    requiresWorkspace: false,
    description: "Update a saved note.",
  },
  {
    name: "delete_memory",
    tags: ["memory"],
    requiresWorkspace: false,
    description: "Delete a saved note.",
  },
  {
    name: "web_search",
    tags: ["web"],
    requiresWorkspace: false,
    description:
      "Search the public web for current results. Each search consumes Usage credit.",
  },
  {
    name: "web_fetch",
    tags: ["web"],
    requiresWorkspace: false,
    description:
      "Read a public web page or text document by URL, returned as markdown.",
  },
] as const satisfies readonly (AgentToolDefinition & { tags: CatalogTags })[];

export type AgentToolName = (typeof CATALOG)[number]["name"];

/** Declared rather than inferred, so `tool.tags.includes(tag)` accepts any tag. */
export const AGENT_TOOLS: readonly (AgentToolDefinition & {
  name: AgentToolName;
})[] = CATALOG;

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
