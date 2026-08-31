import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_CATALOG,
  agentToolGroupIds,
  expandToolGroups,
} from "./agent-tools.ts";

describe("AGENT_TOOL_CATALOG", () => {
  it("exposes one durable Workspace group covering the seven file tools", () => {
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

describe("expandToolGroups", () => {
  it("expands the file-operation group into the seven file tool keys", () => {
    const expected = new Set([
      "read",
      "write",
      "edit",
      "grep",
      "glob",
      "bash",
      "publish_artifacts",
    ]);
    expect(expandToolGroups(["workspace"])).toEqual(expected);
  });

  it("returns an empty set for no group ids", () => {
    expect(expandToolGroups([])).toEqual(new Set());
  });

  it("expands the memory group into the five memory tool keys", () => {
    expect(expandToolGroups(["memory"])).toEqual(
      new Set([
        "save_memory",
        "get_memory",
        "search_memories",
        "update_memory",
        "delete_memory",
      ])
    );
  });

  it("ignores unknown group ids", () => {
    expect(expandToolGroups(["unknown"])).toEqual(new Set());
  });

  it("unions tools across multiple group ids", () => {
    expect(expandToolGroups(["workspace", "write_todos"])).toEqual(
      new Set([
        "read",
        "write",
        "edit",
        "grep",
        "glob",
        "bash",
        "publish_artifacts",
        "write_todos",
      ])
    );
  });
});
