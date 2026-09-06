import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "../client.ts";
import { BlazingAgentsError } from "../errors.ts";
import type { BlazingAgentsFetch, ResourceRequestOptions } from "../types.ts";

const requests: [
  string,
  (client: BlazingAgents, options: ResourceRequestOptions) => Promise<unknown>,
][] = [
  ["agents.list", (c, o) => c.agents.list({ userId: "user", ...o })],
  ["agents.get", (c, o) => c.agents.get({ agentId: "agent", ...o })],
  [
    "agents.getVersion",
    (c, o) => c.agents.getVersion({ agentId: "agent", version: 1, ...o }),
  ],
  [
    "agents.listVersions",
    (c, o) => c.agents.listVersions({ agentId: "agent", ...o }),
  ],
  [
    "agents.listMcpAttachments",
    (c, o) => c.agents.listMcpAttachments({ agentId: "agent", ...o }),
  ],
  [
    "sessions.list",
    (c, o) => c.sessions.list({ agentId: "agent", limit: 10, ...o }),
  ],
  [
    "sessions.messages",
    (c, o) =>
      c.sessions.messages({ agentId: "agent", sessionId: "session", ...o }),
  ],
  [
    "sessions.toolApprovals",
    (c, o) =>
      c.sessions.toolApprovals({
        agentId: "agent",
        sessionId: "session",
        ...o,
      }),
  ],
  [
    "workspaces.get",
    (c, o) => c.workspaces.get({ workspaceId: "workspace", ...o }),
  ],
  ["workspaces.list", (c, o) => c.workspaces.list(o)],
  [
    "artifacts.get",
    (c, o) => c.artifacts.get({ artifactId: "artifact", ...o }),
  ],
  ["artifacts.list", (c, o) => c.artifacts.list(o)],
  [
    "memories.get",
    (c, o) => c.memories.get({ agentId: "agent", memoryId: "memory", ...o }),
  ],
  ["memories.list", (c, o) => c.memories.list({ agentId: "agent", ...o })],
  ["prompts.get", (c, o) => c.prompts.get({ promptId: "prompt", ...o })],
  ["prompts.list", (c, o) => c.prompts.list({ userId: "user", ...o })],
  [
    "providers.get",
    (c, o) => c.providers.get({ providerId: "provider", ...o }),
  ],
  ["providers.list", (c, o) => c.providers.list(o)],
  [
    "providers.listModels",
    (c, o) => c.providers.listModels({ providerId: "provider", ...o }),
  ],
  [
    "providers.getThinkingLevels",
    (c, o) =>
      c.providers.getThinkingLevels({
        providerId: "provider",
        model: "model",
        ...o,
      }),
  ],
  [
    "mcpConnections.get",
    (c, o) => c.mcpConnections.get({ mcpConnectionId: "connection", ...o }),
  ],
  ["mcpConnections.list", (c, o) => c.mcpConnections.list(o)],
  [
    "skills.get",
    (c, o) =>
      c.agent({ agentId: "agent" }).skills.get({ skillId: "skill", ...o }),
  ],
  [
    "skills.getFile",
    (c, o) =>
      c
        .agent({ agentId: "agent" })
        .skills.getFile({ skillId: "skill", path: "SKILL.md", ...o }),
  ],
  ["skills.list", (c, o) => c.agent({ agentId: "agent" }).skills.list(o)],
  ["tasks.get", (c, o) => c.tasks.get({ taskId: "task", ...o })],
  [
    "tasks.getRun",
    (c, o) => c.tasks.getRun({ taskId: "task", runId: "run", ...o }),
  ],
  ["tasks.list", (c, o) => c.tasks.list(o)],
  ["tasks.listRuns", (c, o) => c.tasks.listRuns({ taskId: "task", ...o })],
  [
    "tasks.runMessages",
    (c, o) => c.tasks.runMessages({ taskId: "task", runId: "run", ...o }),
  ],
  ["tenant.get", (c, o) => c.tenant.get(o)],
  ["usage.get", (c, o) => c.usage.get({ userId: "user", ...o })],
  [
    "usage.getForAgent",
    (c, o) => c.usage.getForAgent({ agentId: "agent", ...o }),
  ],
  ["agents.create", (c, o) => c.agents.create({ name: "Builder", ...o })],
  [
    "agents.update",
    (c, o) => c.agents.update({ agentId: "agent", name: "Builder", ...o }),
  ],
  [
    "agents.delete",
    (c, o) =>
      c.agents.delete({ agentId: "agent", includeArtifacts: true, ...o }),
  ],
  ["agents.enable", (c, o) => c.agents.enable({ agentId: "agent", ...o })],
  ["agents.disable", (c, o) => c.agents.disable({ agentId: "agent", ...o })],
  [
    "agents.removeAvatar",
    (c, o) => c.agents.removeAvatar({ agentId: "agent", ...o }),
  ],
  [
    "agents.uploadAvatar",
    (c, o) =>
      c.agents.uploadAvatar({
        agentId: "agent",
        file: new File(["image"], "avatar.png"),
        ...o,
      }),
  ],
  [
    "agents.updateMcpAttachment",
    (c, o) =>
      c.agents.updateMcpAttachment({
        agentId: "agent",
        mcpConnectionId: "connection",
        forwardUserId: true,
        ...o,
      }),
  ],
  [
    "sessions.delete",
    (c, o) =>
      c.sessions.delete({
        agentId: "agent",
        sessionId: "session",
        deleteArtifacts: true,
        ...o,
      }),
  ],
  [
    "sessions.decideToolApproval",
    (c, o) =>
      c.sessions.decideToolApproval({
        agentId: "agent",
        sessionId: "session",
        approvalId: "approval",
        approved: true,
        ...o,
      }),
  ],
  [
    "sessions.joinToolApprovalContinuation",
    (c, o) =>
      c.sessions.joinToolApprovalContinuation({
        agentId: "agent",
        sessionId: "session",
        continuationId: "continuation",
        ...o,
      }),
  ],
  ["workspaces.create", (c, o) => c.workspaces.create(o)],
  [
    "workspaces.update",
    (c, o) =>
      c.workspaces.update({
        workspaceId: "workspace",
        name: "Workspace",
        ...o,
      }),
  ],
  [
    "workspaces.delete",
    (c, o) => c.workspaces.delete({ workspaceId: "workspace", ...o }),
  ],
  [
    "artifacts.createDownloadUrl",
    (c, o) => c.artifacts.createDownloadUrl({ artifactId: "artifact", ...o }),
  ],
  [
    "artifacts.delete",
    (c, o) => c.artifacts.delete({ artifactId: "artifact", ...o }),
  ],
  [
    "memories.create",
    (c, o) => c.memories.create({ agentId: "agent", text: "Remember", ...o }),
  ],
  [
    "memories.update",
    (c, o) =>
      c.memories.update({
        agentId: "agent",
        memoryId: "memory",
        text: "Remember",
        ...o,
      }),
  ],
  [
    "memories.delete",
    (c, o) => c.memories.delete({ agentId: "agent", memoryId: "memory", ...o }),
  ],
  [
    "prompts.create",
    (c, o) => c.prompts.create({ name: "Prompt", template: "Hello", ...o }),
  ],
  [
    "prompts.update",
    (c, o) => c.prompts.update({ promptId: "prompt", name: "Prompt", ...o }),
  ],
  ["prompts.delete", (c, o) => c.prompts.delete({ promptId: "prompt", ...o })],
  [
    "providers.create",
    (c, o) =>
      c.providers.create({
        name: "Provider",
        providerType: "custom",
        baseUrl: "https://example.com",
        apiKey: "key",
        ...o,
      }),
  ],
  [
    "providers.update",
    (c, o) =>
      c.providers.update({ providerId: "provider", name: "Provider", ...o }),
  ],
  [
    "providers.delete",
    (c, o) => c.providers.delete({ providerId: "provider", ...o }),
  ],
  [
    "mcpConnections.create",
    (c, o) =>
      c.mcpConnections.create({
        name: "Connection",
        url: "https://example.com/mcp",
        authType: "none",
        ...o,
      }),
  ],
  [
    "mcpConnections.update",
    (c, o) =>
      c.mcpConnections.update({
        mcpConnectionId: "connection",
        name: "Connection",
        ...o,
      }),
  ],
  [
    "mcpConnections.delete",
    (c, o) => c.mcpConnections.delete({ mcpConnectionId: "connection", ...o }),
  ],
  [
    "mcpConnections.connect",
    (c, o) => c.mcpConnections.connect({ mcpConnectionId: "connection", ...o }),
  ],
  [
    "mcpConnections.reconnect",
    (c, o) =>
      c.mcpConnections.reconnect({
        mcpConnectionId: "connection",
        authType: "none",
        url: "https://example.com/mcp",
        ...o,
      }),
  ],
  [
    "mcpConnections.test",
    (c, o) => c.mcpConnections.test({ mcpConnectionId: "connection", ...o }),
  ],
  [
    "skills.create",
    (c, o) =>
      c.agent({ agentId: "agent" }).skills.create({
        path: "SKILL.md",
        content: "---\nname: test\ndescription: Test.\n---\n",
        ...o,
      }),
  ],
  [
    "skills.delete",
    (c, o) =>
      c.agent({ agentId: "agent" }).skills.delete({ skillId: "skill", ...o }),
  ],
  [
    "skills.deleteFile",
    (c, o) =>
      c
        .agent({ agentId: "agent" })
        .skills.deleteFile({ skillId: "skill", path: "file.txt", ...o }),
  ],
  [
    "skills.putFile",
    (c, o) =>
      c.agent({ agentId: "agent" }).skills.putFile({
        skillId: "skill",
        path: "file.txt",
        content: "hello",
        ...o,
      }),
  ],
  [
    "skills.upload",
    (c, o) =>
      c.agent({ agentId: "agent" }).skills.upload({
        source: { file: new Blob(["archive"]), type: "zip" },
        ...o,
      }),
  ],
  [
    "skills.copy",
    (c, o) =>
      c.agent({ agentId: "agent" }).skills.copy({
        skillId: "skill_0123456789abcdef",
        to: { agentIds: ["ag_0123456789abcdef"] },
        ...o,
      }),
  ],
  [
    "tasks.create",
    (c, o) =>
      c.tasks.create({
        agentId: "ag_0123456789abcdef",
        name: "Task",
        prompt: "Hello",
        ...o,
      }),
  ],
  [
    "tasks.update",
    (c, o) => c.tasks.update({ taskId: "task", name: "Task", ...o }),
  ],
  ["tasks.delete", (c, o) => c.tasks.delete({ taskId: "task", ...o })],
  ["tasks.createRun", (c, o) => c.tasks.createRun({ taskId: "task", ...o })],
  [
    "tasks.cancelRun",
    (c, o) => c.tasks.cancelRun({ taskId: "task", runId: "run", ...o }),
  ],
  ["tenant.patch", (c, o) => c.tenant.patch({ name: "Tenant", ...o })],
  [
    "chat",
    (c, o) =>
      c.chat({
        agentId: "agent",
        message: {
          id: "message",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
        ...o,
      }),
  ],
  [
    "completion",
    (c, o) => c.completion({ agentId: "agent", prompt: "Hello", ...o }),
  ],
  [
    "object",
    (c, o) =>
      c.object({
        agentId: "agent",
        prompt: "Hello",
        schema: { type: "object" },
        ...o,
      }),
  ],
];

describe("resource request cancellation", () => {
  it.each(requests)(
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
      const request = read(client, { abortSignal: abort.signal });
      abort.abort();

      await expect(request).rejects.toBeInstanceOf(BlazingAgentsError);
      await expect(request).rejects.toMatchObject({ code: "request_aborted" });
      const [url, init] = fetch.mock.calls[0];
      expect(init?.signal).toBe(abort.signal);
      expect(new URL(url).searchParams.has("signal")).toBe(false);
      expect(new URL(url).searchParams.has("abortSignal")).toBe(false);
      if (typeof init?.body === "string") {
        expect(init.body).not.toContain('"abortSignal"');
        expect(init.body).not.toContain('"signal"');
      } else if (init?.body instanceof FormData) {
        expect(init.body.has("abortSignal")).toBe(false);
        expect(init.body.has("signal")).toBe(false);
      }
    }
  );
});
