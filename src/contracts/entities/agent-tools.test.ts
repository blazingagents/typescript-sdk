import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  // biome-ignore lint/suspicious/noDeprecatedImports: the deprecated alias stays tested until it is removed
  AGENT_TOOL_CATEGORIES,
  AGENT_TOOL_GROUPS,
  AGENT_TOOL_TAGS,
  AGENT_TOOLS,
  agentToolNames,
  chatFunctionNameSchema,
} from "./agent-tools.ts";

describe("AGENT_TOOLS", () => {
  it("lists every toggleable tool with its tags", () => {
    expect(
      AGENT_TOOLS.map(({ name, tags, requiresWorkspace }) => [
        name,
        tags,
        requiresWorkspace,
      ])
    ).toEqual([
      ["read", ["files", "file_read"], true],
      ["write", ["files", "file_write"], true],
      ["edit", ["files", "file_write"], true],
      ["grep", ["files", "file_read"], true],
      ["glob", ["files", "file_read"], true],
      ["bash", ["files", "execute"], true],
      ["publish_artifacts", ["files"], true],
      ["write_todos", ["planning"], false],
      ["save_memory", ["memory"], false],
      ["get_memory", ["memory"], false],
      ["search_memories", ["memory"], false],
      ["update_memory", ["memory"], false],
      ["delete_memory", ["memory"], false],
      ["web_search", ["web"], false],
    ]);
    expect(agentToolNames).toEqual(AGENT_TOOLS.map((tool) => tool.name));
  });

  it("gives every group a tool and keeps the deprecated category equal to the group tag", () => {
    const groupTags = AGENT_TOOL_GROUPS.map((group) => group.tag);
    expect(groupTags).toEqual(["files", "planning", "memory", "web"]);
    expect(new Set(AGENT_TOOLS.map((tool) => tool.tags[0]))).toEqual(
      new Set(groupTags)
    );
    for (const tool of AGENT_TOOLS) {
      expect(tool.category).toBe(tool.tags[0]);
    }
    expect(AGENT_TOOL_CATEGORIES).toEqual(
      AGENT_TOOL_GROUPS.map(({ tag, name, description }) => ({
        id: tag,
        name,
        description,
      }))
    );
  });

  it("matches the committed agent-tools.json other SDKs compare against", () => {
    const committed = JSON.parse(
      readFileSync(
        new URL("../../../agent-tools.json", import.meta.url),
        "utf8"
      )
    );
    expect(committed, "run npm run agent-tools:json").toEqual({
      tags: AGENT_TOOL_TAGS,
      groups: AGENT_TOOL_GROUPS,
      tools: AGENT_TOOLS.map(({ category: _category, ...tool }) => tool),
    });
  });
});

describe("chatFunctionNameSchema", () => {
  it("reserves every Agent tool name and activate_skill", () => {
    for (const name of [...agentToolNames, "activate_skill"]) {
      expect(chatFunctionNameSchema.safeParse(name).success).toBe(false);
    }
  });
});
