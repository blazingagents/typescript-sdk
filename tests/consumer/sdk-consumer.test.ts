import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  BlazingAgents,
  BlazingAgentsError,
  type SkillCopyResults,
} from "@blazingagents/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const agent = {
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "ag_0123456789abcdef",
  instructions: "Be helpful.",
  mcpConnectionIds: [],
  memoryInjectionEnabled: false,
  metadata: {},
  model: null,
  name: "Consumer Agent",
  providerId: null,
  thinkingLevel: null,
  workspaceId: "ws_0123456789abcdef",
  status: "active",
  tenantId: "ten_0123456789abcdef",
  tools: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
  userId: "",
  version: 1,
};
const workspace = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "ws_0123456789abcdef",
  metadata: {},
  name: "Consumer Workspace",
  networkPolicy: { mode: "unrestricted" },
  tenantId: "ten_0123456789abcdef",
  updatedAt: "2026-01-01T00:00:00.000Z",
  userId: "",
};
const skill = {
  agentId: agent.id,
  createdAt: "2026-01-01T00:00:00.000Z",
  description: "Consumer Skill.",
  files: [
    { path: "SKILL.md", sizeBytes: 58 },
    { path: "assets/icon one.bin", sizeBytes: 4 },
  ],
  id: "skill_0123456789abcdef",
  name: "consumer",
  tenantId: agent.tenantId,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const skillSummary = {
  agentId: skill.agentId,
  createdAt: skill.createdAt,
  description: skill.description,
  id: skill.id,
  name: skill.name,
  tenantId: skill.tenantId,
  updatedAt: skill.updatedAt,
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("installed SDK consumer contract", () => {
  const agentCreateBodies: unknown[] = [];
  const authorizationHeaders: (string | undefined)[] = [];
  const uploadedSkillFiles: Uint8Array[] = [];
  let client: BlazingAgents;
  let server: Server;

  beforeAll(async () => {
    server = createServer((request, response) => {
      authorizationHeaders.push(request.headers.authorization);

      if (request.method === "POST" && request.url === "/v1/agents") {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
        });
        request.on("end", () => {
          const parsed: unknown = JSON.parse(body);
          agentCreateBodies.push(parsed);
          response.writeHead(201, { "content-type": "application/json" });
          response.end(JSON.stringify(agent));
        });
        return;
      }

      if (request.method === "GET" && request.url === "/v1/agents") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ agents: [agent] }));
        return;
      }

      if (
        request.method === "GET" &&
        request.url === `/v1/agents?workspaceId=${workspace.id}`
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ agents: [agent] }));
        return;
      }

      if (
        request.method === "GET" &&
        request.url === "/v1/workspaces?limit=1"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [workspace], nextCursor: null }));
        return;
      }

      if (request.method === "POST" && request.url === "/v1/workspaces") {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify(workspace));
        return;
      }

      if (
        request.url === `/v1/workspaces/${workspace.id}` &&
        request.method === "GET"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(workspace));
        return;
      }

      if (
        request.url === `/v1/workspaces/${workspace.id}` &&
        request.method === "PUT"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ ...workspace, name: "Updated Consumer Workspace" })
        );
        return;
      }

      if (
        request.url === `/v1/workspaces/${workspace.id}` &&
        request.method === "DELETE"
      ) {
        response.writeHead(204);
        response.end();
        return;
      }

      if (
        request.method === "PUT" &&
        request.url === `/v1/agents/${agent.id}`
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ...agent, workspaceId: workspace.id }));
        return;
      }

      if (
        request.method === "POST" &&
        request.url === `/v1/agents/${agent.id}/skills`
      ) {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify(skill));
        return;
      }

      if (
        request.method === "GET" &&
        request.url === `/v1/agents/${agent.id}/skills?limit=1`
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ data: [skillSummary], nextCursor: null })
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url === `/v1/agents/${agent.id}/skills/${skill.id}`
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(skill));
        return;
      }

      if (
        request.method === "DELETE" &&
        request.url === `/v1/agents/${agent.id}/skills/${skill.id}`
      ) {
        response.writeHead(204);
        response.end();
        return;
      }

      if (
        request.method === "DELETE" &&
        request.url ===
          `/v1/agents/${agent.id}/skills/${skill.id}/files/assets/icon%20one.bin`
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(skill));
        return;
      }

      if (
        request.method === "POST" &&
        request.url === `/v1/agents/${agent.id}/skills/upload`
      ) {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify(skill));
        return;
      }

      if (
        request.method === "POST" &&
        request.url === `/v1/agents/${agent.id}/skills/${skill.id}/copies`
      ) {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(
          JSON.stringify([
            {
              agentId: "ag_1111111111111111",
              skill: {
                ...skill,
                agentId: "ag_1111111111111111",
                id: "skill_1111111111111111",
              },
              status: "created",
            },
          ])
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url ===
          `/v1/agents/${agent.id}/skills/${skill.id}/files/assets/icon%20one.bin`
      ) {
        response.writeHead(200, {
          "content-type": "application/octet-stream",
        });
        response.end(Uint8Array.from([0, 255, 128, 1]));
        return;
      }

      if (
        request.method === "PUT" &&
        request.url ===
          `/v1/agents/${agent.id}/skills/${skill.id}/files/assets/upload.bin`
      ) {
        const chunks: Uint8Array[] = [];
        request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        request.on("end", () => {
          uploadedSkillFiles.push(
            Uint8Array.from(
              Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
            )
          );
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(skill));
        });
        return;
      }

      if (
        request.method === "POST" &&
        request.url === `/v1/agents/${agent.id}/sessions`
      ) {
        response.writeHead(201, {
          "content-type": "text/event-stream",
          location: `/v1/agents/${agent.id}/sessions/ss_0123456789abcdef`,
          "x-request-id": "request-chat",
        });
        response.write(
          `data: ${JSON.stringify({ type: "start", messageId: "assistant-1" })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({ type: "text-start", id: "text-1" })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({ type: "text-delta", id: "text-1", delta: "Hello consumer" })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({ type: "text-end", id: "text-1" })}\n\n`
        );
        response.end("data: [DONE]\n\n");
        return;
      }

      if (
        request.method === "POST" &&
        request.url === `/v1/agents/${agent.id}/generation`
      ) {
        response.writeHead(200, {
          "content-type": "text/plain",
          "x-request-id": "request-completion",
        });
        response.write("Hello ");
        response.end("consumer");
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/v1/artifacts/at_0123456789abcdef/download-url"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            expiresAt: "2026-07-31T12:05:00.000Z",
            url: "https://r2.example.test/signed-object",
          })
        );
        return;
      }

      response.writeHead(409, {
        "content-type": "application/json",
        "x-request-id": "request-future-error",
      });
      response.end(
        JSON.stringify({
          error: {
            code: "future_server_outcome",
            details: { recovery: "refresh" },
            futureField: true,
            message: "A newer server outcome.",
            param: "/version",
          },
          futureEnvelopeField: "accepted",
        })
      );
    });

    const port = await listen(server);
    client = new BlazingAgents({
      apiKey: "ba_consumer_contract",
      baseUrl: `http://127.0.0.1:${port}`,
    });
  });

  afterAll(async () => {
    await close(server);
  });

  it("uses the public package entry for a resource request", async () => {
    const result = await client.agents.list();

    expect(result.agents).toEqual([agent]);
    expect(result.agents[0].workspaceId).toBe(workspace.id);
    expect(authorizationHeaders.at(-1)).toBe("Bearer ba_consumer_contract");
  });

  it("creates an Agent with an implicit Workspace through compiled HTTP", async () => {
    await expect(
      client.agents.create({ name: "Implicit Workspace Agent" })
    ).resolves.toMatchObject({ workspaceId: workspace.id });
    expect(agentCreateBodies.at(-1)).toEqual({
      name: "Implicit Workspace Agent",
    });
  });

  it("creates an Artifact R2 download URL through compiled real HTTP", async () => {
    await expect(
      client.artifacts.createDownloadUrl("at_0123456789abcdef")
    ).resolves.toEqual({
      expiresAt: "2026-07-31T12:05:00.000Z",
      url: "https://r2.example.test/signed-object",
    });
    expect(authorizationHeaders.at(-1)).toBe("Bearer ba_consumer_contract");
  });

  it("uses compiled Workspace and Agent attachment filters", async () => {
    await expect(
      client.agents.list({ workspaceId: workspace.id })
    ).resolves.toEqual({ agents: [agent] });
    await expect(client.workspaces.list({ limit: 1 })).resolves.toEqual({
      data: [workspace],
      nextCursor: null,
    });
  });

  it("uses compiled Workspace CRUD, Agent attachment, and nested Skill operations", async () => {
    await expect(
      client.workspaces.create({ name: workspace.name })
    ).resolves.toEqual(workspace);
    await expect(
      client.workspaces.get({ workspaceId: workspace.id })
    ).resolves.toEqual(workspace);
    await expect(
      client.workspaces.update({
        name: "Updated Consumer Workspace",
        workspaceId: workspace.id,
      })
    ).resolves.toMatchObject({ name: "Updated Consumer Workspace" });
    await expect(
      client.agents.update(agent.id, { workspaceId: workspace.id })
    ).resolves.toMatchObject({ workspaceId: workspace.id });

    const skills = client.agent(agent.id).skills;
    const created = await skills.create({
      content: "---\nname: consumer\ndescription: Consumer Skill.\n---\n",
      path: "SKILL.md",
    });
    await expect(skills.get({ skillId: created.id })).resolves.toEqual(skill);
    await expect(skills.list({ limit: 1 })).resolves.toEqual({
      data: [skillSummary],
      nextCursor: null,
    });
    await expect(
      skills.deleteFile({
        path: "assets/icon one.bin",
        skillId: skill.id,
      })
    ).resolves.toEqual(skill);
    await expect(
      skills.upload({
        source: { file: Uint8Array.from([1, 2, 3]), type: "zip" },
      })
    ).resolves.toEqual(skill);

    const copyResults: SkillCopyResults = await skills.copy({
      skillId: skill.id,
      to: { agentIds: ["ag_1111111111111111"] },
    });
    expect(copyResults).toEqual([
      {
        agentId: "ag_1111111111111111",
        skill: {
          ...skill,
          agentId: "ag_1111111111111111",
          id: "skill_1111111111111111",
        },
        status: "created",
      },
    ]);

    await expect(skills.delete({ skillId: skill.id })).resolves.toBeUndefined();
    await expect(
      client.workspaces.delete({ workspaceId: workspace.id })
    ).resolves.toBe("completed");
  });

  it("round-trips Skill binary values through compiled real HTTP", async () => {
    const bytes = Uint8Array.from([0, 255, 128, 1]);

    await expect(
      client.agent(agent.id).skills.getFile({
        path: "assets/icon one.bin",
        skillId: skill.id,
      })
    ).resolves.toEqual(bytes);
    await expect(
      client.agent(agent.id).skills.putFile({
        content: bytes,
        path: "assets/upload.bin",
        skillId: skill.id,
      })
    ).resolves.toEqual(skill);
    expect(uploadedSkillFiles.at(-1)).toEqual(bytes);
  });

  it("preserves a future API error through compiled real HTTP", async () => {
    const error = await client.agents
      .get("ag_0000000000000000")
      .catch((caught) => caught);

    expect(BlazingAgentsError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      code: "future_server_outcome",
      details: { recovery: "refresh" },
      message: "A newer server outcome.",
      param: "/version",
      requestId: "request-future-error",
      status: 409,
    });
    expect(error.headers.get("x-request-id")).toBe("request-future-error");
  });

  it("streams a generation response over real Node HTTP", async () => {
    const result = await client.completion({
      agentId: agent.id,
      prompt: "Say hello",
    });
    const deltas: string[] = [];

    for await (const delta of result.textStream) {
      deltas.push(delta);
    }

    expect(deltas.join("")).toBe("Hello consumer");
    expect(await result.text).toBe("Hello consumer");
    expect(result.requestId).toBe("request-completion");
    expect(authorizationHeaders.at(-1)).toBe("Bearer ba_consumer_contract");
  });

  it("relays a chat stream through the compiled public package", async () => {
    const result = await client.chat({
      agentId: agent.id,
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Say hello" }],
      },
    });
    const body = await result.toResponse().text();

    expect(await result.sessionId).toBe("ss_0123456789abcdef");
    expect(result.requestId).toBe("request-chat");
    expect(body).toContain(
      'data: {"type":"text-delta","id":"text-1","delta":"Hello consumer"}'
    );
    expect(authorizationHeaders.at(-1)).toBe("Bearer ba_consumer_contract");
  });
});
