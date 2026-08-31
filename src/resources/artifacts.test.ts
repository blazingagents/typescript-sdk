import { describe, expect, it } from "vitest";
import { BlazingAgents } from "../client.ts";
import { createMockFetch } from "../test/fixtures.ts";

const baseUrl = "http://localhost:8787";
const artifact = {
  artifactId: "at_0123456789abcdef",
  agentId: "ag_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  sessionId: "ss_0123456789abcdef",
  filename: "out.txt",
  mediaType: "text/plain",
  sizeBytes: 12,
  userId: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl, fetch });
}

describe("client.artifacts", () => {
  it("gets and validates Tenant-level Artifact metadata", async () => {
    const { fetch, calls } = createMockFetch({ body: artifact });

    await expect(
      client(fetch).artifacts.get(artifact.artifactId)
    ).resolves.toEqual(artifact);
    expect(calls[0].url).toBe(`${baseUrl}/v1/artifacts/${artifact.artifactId}`);
  });

  it("creates and validates a direct R2 download URL", async () => {
    const expiresAt = "2026-07-31T12:05:00.000Z";
    const url = "https://r2.example.test/signed-object";
    const { fetch, calls } = createMockFetch({ body: { expiresAt, url } });

    await expect(
      client(fetch).artifacts.createDownloadUrl(artifact.artifactId)
    ).resolves.toEqual({ expiresAt, url });
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeNull();
    expect(calls[0].url).toBe(
      `${baseUrl}/v1/artifacts/${artifact.artifactId}/download-url`
    );
  });

  it.each([
    [{}, ""],
    [{ agentId: artifact.agentId }, `?agentId=${artifact.agentId}`],
    [{ sessionId: artifact.sessionId }, `?sessionId=${artifact.sessionId}`],
    [{ cursor: "next page" }, "?cursor=next+page"],
  ])("serializes list options %#", async (options, suffix) => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    await client(fetch).artifacts.list(options);
    expect(calls[0].url).toBe(`${baseUrl}/v1/artifacts${suffix}`);
  });

  it("validates list responses", async () => {
    const { fetch } = createMockFetch({
      body: { data: [artifact], nextCursor: "next" },
    });

    await expect(client(fetch).artifacts.list()).resolves.toEqual({
      data: [artifact],
      nextCursor: "next",
    });
  });

  it("deletes through the Tenant-level Artifact route", async () => {
    const { fetch, calls } = createMockFetch({ status: 204, text: "" });

    await client(fetch).artifacts.delete(artifact.artifactId);
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${baseUrl}/v1/artifacts/${artifact.artifactId}`);
  });

  it("rejects malformed detail and download URL responses", async () => {
    const invalidDetail = createMockFetch({ body: { ...artifact, key: "r2" } });
    const invalidUrl = createMockFetch({
      body: { expiresAt: "later", url: "/relative" },
    });

    await expect(
      client(invalidDetail.fetch).artifacts.get(artifact.artifactId)
    ).rejects.toBeDefined();
    await expect(
      client(invalidUrl.fetch).artifacts.createDownloadUrl(artifact.artifactId)
    ).rejects.toBeDefined();
  });
});
