import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_CATEGORIES,
  AGENT_TOOLS,
  agentToolNames,
  chatFunctionNameSchema,
} from "./agent-tools.ts";

describe("AGENT_TOOLS", () => {
  it("lists every toggleable tool with its display category", () => {
    expect(
      AGENT_TOOLS.map(({ name, category, requiresWorkspace }) => [
        name,
        category,
        requiresWorkspace,
      ])
    ).toEqual([
      ["read", "files", true],
      ["write", "files", true],
      ["edit", "files", true],
      ["grep", "files", true],
      ["glob", "files", true],
      ["bash", "files", true],
      ["publish_artifacts", "files", true],
      ["write_todos", "planning", false],
      ["save_memory", "memory", false],
      ["get_memory", "memory", false],
      ["search_memories", "memory", false],
      ["update_memory", "memory", false],
      ["delete_memory", "memory", false],
      ["web_search", "web", false],
    ]);
    expect(agentToolNames).toEqual(AGENT_TOOLS.map((tool) => tool.name));
  });

  it("assigns every tool to a declared category and leaves none empty", () => {
    const categoryIds = AGENT_TOOL_CATEGORIES.map((category) => category.id);
    expect(categoryIds).toEqual(["files", "planning", "memory", "web"]);
    expect(new Set(AGENT_TOOLS.map((tool) => tool.category))).toEqual(
      new Set(categoryIds)
    );
  });
});

describe("chatFunctionNameSchema", () => {
  it("reserves every Agent tool name and activate_skill", () => {
    for (const name of [...agentToolNames, "activate_skill"]) {
      expect(chatFunctionNameSchema.safeParse(name).success).toBe(false);
    }
  });
});
