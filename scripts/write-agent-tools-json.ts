import { writeFileSync } from "node:fs";
import {
  AGENT_TOOL_GROUPS,
  AGENT_TOOL_TAGS,
  AGENT_TOOLS,
} from "../src/contracts/entities/agent-tools.ts";

/** Writes the catalog the Python and Rust SDKs compare theirs against. */
const catalog = {
  tags: AGENT_TOOL_TAGS,
  groups: AGENT_TOOL_GROUPS,
  tools: AGENT_TOOLS.map(({ name, description, requiresWorkspace, tags }) => ({
    name,
    description,
    requiresWorkspace,
    tags,
  })),
};

writeFileSync(
  new URL("../agent-tools.json", import.meta.url),
  `${JSON.stringify(catalog, null, 2)}\n`
);
