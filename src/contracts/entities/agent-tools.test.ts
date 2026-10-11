import { describe, expect, it } from "vitest";

import { AGENT_TOOL_CATALOG, agentToolGroupIds } from "./agent-tools.ts";

describe("AGENT_TOOL_CATALOG", () => {
  it("exposes one Workspace group covering the seven file tools", () => {
    expect(AGENT_TOOL_CATALOG[0].id).toBe("workspace");
    expect(AGENT_TOOL_CATALOG[0].tools).toEqual([
      "read",
      "write",
      "edit",
      "grep",
      "glob",
      "bash",
      "publish_artifacts",
    ]);
    expect(AGENT_TOOL_CATALOG[1]).toMatchObject({
      id: "write_todos",
      tools: ["write_todos"],
    });
    expect(AGENT_TOOL_CATALOG[2]).toMatchObject({
      id: "memory",
      tools: [
        "save_memory",
        "get_memory",
        "search_memories",
        "update_memory",
        "delete_memory",
      ],
    });
  });
});

describe("agentToolGroupIds", () => {
  it("lists the catalog group ids", () => {
    expect(agentToolGroupIds).toEqual(["workspace", "write_todos", "memory"]);
  });
});
