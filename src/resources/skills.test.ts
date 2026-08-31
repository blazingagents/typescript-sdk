import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const BASE = "http://localhost:8787";
const agentId = "ag_0123456789abcdef";
const skillId = "skill_0123456789abcdef";
const markdown = `---
name: deploy
description: Deploy the application.
---
`;
const skill = {
  agentId,
  createdAt: "2026-07-31T12:00:00.000Z",
  description: "Deploy the application.",
  files: [{ path: "SKILL.md", sizeBytes: 62 }],
  id: skillId,
  name: "deploy",
  tenantId: "ten_0123456789abcdef",
  updatedAt: "2026-07-31T12:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("client.agent(agentId).skills", () => {
  it("creates an Agent Skill from root SKILL.md JSON", async () => {
    const { fetch, calls } = createMockFetch({ body: skill });

    await expect(
      client(fetch).agent(agentId).skills.create({
        content: markdown,
        path: "SKILL.md",
      })
    ).resolves.toEqual(skill);
    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/skills`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      content: markdown,
      path: "SKILL.md",
    });
  });

  it("uploads declared archive bytes through the nested multipart route", async () => {
    const { fetch, calls } = createMockFetch({ body: skill });
    const archive = Uint8Array.from([0, 255, 128, 1]);

    await expect(
      client(fetch)
        .agent(agentId)
        .skills.upload({
          source: { file: archive, type: "tar.gz" },
        })
    ).resolves.toEqual(skill);
    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/skills/upload`);
    expect(calls[0].init?.method).toBe("POST");
    const form = calls[0].init?.body as FormData;
    expect(form.get("type")).toBe("tar.gz");
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(archive);
  });

  it("preserves Blob archive content in multipart upload", async () => {
    const { fetch, calls } = createMockFetch({ body: skill });
    const archive = new Blob([Uint8Array.from([80, 75, 3, 4])]);

    await client(fetch)
      .agent(agentId)
      .skills.upload({
        source: { file: archive, type: "zip" },
      });

    expect(calls[0].init?.body).toBeInstanceOf(FormData);
    const form = calls[0].init?.body as FormData;
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect(await (file as File).arrayBuffer()).toEqual(
      await archive.arrayBuffer()
    );
  });

  it("lists one Agent's cursor-paginated Skills", async () => {
    const { files: _files, ...skillListItem } = skill;
    const { fetch, calls } = createMockFetch({
      body: { data: [skillListItem], nextCursor: "next" },
    });

    await expect(
      client(fetch).agent(agentId).skills.list({ cursor: "page", limit: 25 })
    ).resolves.toEqual({ data: [skillListItem], nextCursor: "next" });
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/skills?cursor=page&limit=25`
    );
  });

  it("lists one Agent's Skills without redundant owner options", async () => {
    const { files: _files, ...skillListItem } = skill;
    const { fetch, calls } = createMockFetch({
      body: { data: [skillListItem], nextCursor: null },
    });

    await expect(client(fetch).agent(agentId).skills.list()).resolves.toEqual({
      data: [skillListItem],
      nextCursor: null,
    });
    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/skills`);
  });

  it("gets one nested Agent Skill", async () => {
    const { fetch, calls } = createMockFetch({ body: skill });

    await expect(
      client(fetch).agent(agentId).skills.get({ skillId })
    ).resolves.toEqual(skill);
    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/skills/${skillId}`);
  });

  it("deletes one nested Agent Skill", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });

    await expect(
      client(fetch).agent(agentId).skills.delete({ skillId })
    ).resolves.toBeUndefined();
    expect(calls[0].url).toBe(`${BASE}/v1/agents/${agentId}/skills/${skillId}`);
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("gets raw file bytes with each relative path segment encoded", async () => {
    const bytes = Uint8Array.from([0, 255, 128, 1]);
    const { fetch, calls } = createMockFetch({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });

    const responseBytes = await client(fetch).agent(agentId).skills.getFile({
      path: "assets/icon one.bin",
      skillId,
    });

    expect(responseBytes).toBeInstanceOf(Uint8Array);
    expect(responseBytes).toEqual(bytes);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/skills/${skillId}/files/assets/icon%20one.bin`
    );
  });

  it("puts raw binary file content and parses the updated Skill", async () => {
    const bytes = Uint8Array.from([0, 255, 128, 1]);
    const { fetch, calls } = createMockFetch({ body: skill });

    await expect(
      client(fetch).agent(agentId).skills.putFile({
        content: bytes,
        path: "assets/icon.bin",
        skillId,
      })
    ).resolves.toEqual(skill);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/skills/${skillId}/files/assets/icon.bin`
    );
    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].init?.body).toBe(bytes);
  });

  it("deletes one supporting file and parses the updated Skill", async () => {
    const { fetch, calls } = createMockFetch({ body: skill });

    await expect(
      client(fetch).agent(agentId).skills.deleteFile({
        path: "notes.txt",
        skillId,
      })
    ).resolves.toEqual(skill);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/skills/${skillId}/files/notes.txt`
    );
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("copies to multiple Agents and preserves ordered partial results", async () => {
    const destinationAgentId = "ag_fedcba9876543210";
    const failedAgentId = "ag_1111111111111111";
    const results = [
      {
        agentId: destinationAgentId,
        skill: { ...skill, agentId: destinationAgentId },
        status: "created",
      },
      {
        agentId: failedAgentId,
        error: { code: "skill_name_conflict", message: "Already exists" },
        status: "failed",
      },
    ];
    const { fetch, calls } = createMockFetch({ body: results });

    await expect(
      client(fetch)
        .agent(agentId)
        .skills.copy({
          skillId,
          to: { agentIds: [destinationAgentId, failedAgentId] },
        })
    ).resolves.toEqual(results);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agents/${agentId}/skills/${skillId}/copies`
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      agentIds: [destinationAgentId, failedAgentId],
    });
  });
});
