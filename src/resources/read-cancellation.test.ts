import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "../client.ts";
import { BlazingAgentsError } from "../errors.ts";
import type { BlazingAgentsFetch, ResourceReadOptions } from "../types.ts";

const reads: [
  string,
  (client: BlazingAgents, options: ResourceReadOptions) => Promise<unknown>,
][] = [
  ["agents.list", (c, o) => c.agents.list({ userId: "user", ...o })],
  ["agents.get", (c, o) => c.agents.get("agent", o)],
  ["agents.getVersion", (c, o) => c.agents.getVersion("agent", 1, o)],
  ["agents.listVersions", (c, o) => c.agents.listVersions("agent", o)],
  [
    "agents.listMcpAttachments",
    (c, o) => c.agents.listMcpAttachments("agent", o),
  ],
  ["sessions.list", (c, o) => c.sessions.list("agent", { limit: 10, ...o })],
  ["sessions.messages", (c, o) => c.sessions.messages("agent", "session", o)],
  [
    "sessions.toolApprovals",
    (c, o) => c.sessions.toolApprovals("agent", "session", o),
  ],
  [
    "workspaces.get",
    (c, o) => c.workspaces.get({ workspaceId: "workspace" }, o),
  ],
  ["workspaces.list", (c, o) => c.workspaces.list(o)],
  ["artifacts.get", (c, o) => c.artifacts.get("artifact", o)],
  ["artifacts.list", (c, o) => c.artifacts.list(o)],
  ["memories.get", (c, o) => c.memories.get("agent", "memory", o)],
  ["memories.list", (c, o) => c.memories.list("agent", o)],
  ["prompts.get", (c, o) => c.prompts.get("prompt", o)],
  ["prompts.list", (c, o) => c.prompts.list("user", o)],
  ["providers.get", (c, o) => c.providers.get("provider", o)],
  ["providers.list", (c, o) => c.providers.list(o)],
  ["providers.listModels", (c, o) => c.providers.listModels("provider", o)],
  [
    "providers.getThinkingLevels",
    (c, o) => c.providers.getThinkingLevels("provider", "model", o),
  ],
  ["mcpConnections.get", (c, o) => c.mcpConnections.get("connection", o)],
  ["mcpConnections.list", (c, o) => c.mcpConnections.list(o)],
  [
    "skills.get",
    (c, o) => c.agent("agent").skills.get({ skillId: "skill" }, o),
  ],
  [
    "skills.getFile",
    (c, o) =>
      c
        .agent("agent")
        .skills.getFile({ skillId: "skill", path: "SKILL.md" }, o),
  ],
  ["skills.list", (c, o) => c.agent("agent").skills.list(o)],
  ["tasks.get", (c, o) => c.tasks.get("task", o)],
  ["tasks.getRun", (c, o) => c.tasks.getRun("task", "run", o)],
  ["tasks.list", (c, o) => c.tasks.list(o)],
  ["tasks.listRuns", (c, o) => c.tasks.listRuns("task", o)],
  ["tasks.runMessages", (c, o) => c.tasks.runMessages("task", "run", o)],
  ["tenant.get", (c, o) => c.tenant.get(o)],
  ["usage.get", (c, o) => c.usage.get({ userId: "user", ...o })],
  ["usage.getForAgent", (c, o) => c.usage.getForAgent("agent", o)],
];

describe("resource read cancellation", () => {
  it.each(reads)(
    "%s cancels fetch without serializing the signal",
    async (_, read) => {
      const abort = new AbortController();
      const fetch = vi.fn<BlazingAgentsFetch>(
        (_url, requestInit) =>
          new Promise((resolve, reject) => {
            requestInit?.signal?.addEventListener(
              "abort",
              () => reject(requestInit.signal?.reason),
              { once: true }
            );
            // Settle even if forwarding regresses, so this test never waits for a timeout.
            abort.signal.addEventListener(
              "abort",
              () => resolve(new Response("{}")),
              { once: true }
            );
          })
      );
      const client = new BlazingAgents({ apiKey: "ba_test", fetch });
      const request = read(client, { signal: abort.signal });
      abort.abort();

      await expect(request).rejects.toBeInstanceOf(BlazingAgentsError);
      await expect(request).rejects.toMatchObject({ code: "request_aborted" });
      const [url, init] = fetch.mock.calls[0];
      expect(init?.signal).toBe(abort.signal);
      expect(new URL(url).searchParams.has("signal")).toBe(false);
    }
  );
});
