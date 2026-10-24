import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
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
      ["web_fetch", ["web"], false],
    ]);
    expect(agentToolNames).toEqual(AGENT_TOOLS.map((tool) => tool.name));
  });

  it("gives every tool one declared group tag and every group a tool", () => {
    const groupTags = AGENT_TOOL_GROUPS.map((group) => group.tag);
    expect(groupTags).toEqual(["files", "planning", "memory", "web"]);
    expect(new Set(AGENT_TOOLS.map((tool) => tool.tags[0]))).toEqual(
      new Set(groupTags)
    );
  });

  it("equals the catalog the vendored API contract publishes as x-agent-tools", () => {
    const contract = JSON.parse(
      readFileSync(
        new URL("../../../spec/openapi.json", import.meta.url),
        "utf8"
      )
    ) as { "x-agent-tools": unknown };
    expect(contract["x-agent-tools"]).toEqual({
      tags: AGENT_TOOL_TAGS,
      groups: AGENT_TOOL_GROUPS,
      tools: AGENT_TOOLS,
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
