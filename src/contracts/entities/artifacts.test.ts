import { describe, expect, it } from "vitest";

import {
  artifactDownloadUrlResponseSchema,
  artifactFilenameSchema,
  artifactListItemSchema,
  artifactsListQuerySchema,
  artifactsListResponseSchema,
  publishArtifactResultSchema,
  publishArtifactsInputSchema,
  publishArtifactsOutputSchema,
} from "./artifacts.ts";

const tenantId = "ten_xxxxxxxxxxxxxxxx";
const agentId = "ag_xxxxxxxxxxxxxxxx";
const sessionId = "ss_xxxxxxxxxxxxxxxx";
const artifactId = "at_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";

const artifact = {
  artifactId,
  agentId,
  tenantId,
  sessionId,
  filename: "report.pdf",
  mediaType: "application/pdf",
  sizeBytes: 1024,
  userId: "",
  metadata: {},
  createdAt: iso,
  updatedAt: iso,
};

describe("artifactFilenameSchema", () => {
  it.each(["report.pdf", "résumé 2026.txt"])("accepts flat name %s", (name) => {
    expect(artifactFilenameSchema.parse(name)).toBe(name);
  });

  it.each(["", " ", ".", "..", "folder/report.pdf", String.raw`folder\file`])(
    "rejects non-flat name %j",
    (name) => {
      expect(artifactFilenameSchema.safeParse(name).success).toBe(false);
    }
  );
});

describe("active Artifact responses", () => {
  it("accepts an active Artifact with updatedAt", () => {
    expect(artifactListItemSchema.parse(artifact)).toStrictEqual(artifact);
  });

  it("rejects tombstone fields", () => {
    expect(
      artifactListItemSchema.safeParse({ ...artifact, deletedAt: null }).success
    ).toBe(false);
  });

  it("uses a paginated list envelope", () => {
    expect(
      artifactsListResponseSchema.parse({
        data: [artifact],
        nextCursor: "next",
      })
    ).toStrictEqual({ data: [artifact], nextCursor: "next" });
  });

  it("accepts Tenant-list provenance filters", () => {
    expect(
      artifactsListQuerySchema.parse({ agentId, sessionId, cursor: null })
    ).toStrictEqual({ agentId, sessionId, cursor: null });
  });
});

describe("Artifact publication contracts", () => {
  it("accepts one to ten paths, including duplicate basenames", () => {
    expect(
      publishArtifactsInputSchema.parse({
        paths: ["/reports/final.txt", "/notes/final.txt"],
      })
    ).toEqual({ paths: ["/reports/final.txt", "/notes/final.txt"] });
    expect(publishArtifactsInputSchema.safeParse({ paths: [] }).success).toBe(
      false
    );
    expect(
      publishArtifactsInputSchema.safeParse({
        paths: Array.from({ length: 11 }, (_, index) => `/${index}.txt`),
      }).success
    ).toBe(false);
  });

  it("rejects blank paths and extra input fields", () => {
    expect(
      publishArtifactsInputSchema.safeParse({ paths: [" "] }).success
    ).toBe(false);
    expect(
      publishArtifactsInputSchema.safeParse({
        paths: ["/report.txt"],
        filename: "renamed.txt",
      }).success
    ).toBe(false);
  });

  it("returns one success or failure per path", () => {
    expect(
      publishArtifactsOutputSchema.parse({
        results: [
          {
            path: "/report.txt",
            artifactId,
          },
          {
            path: "/missing.txt",
            error: true,
            message: "Workspace file not found",
          },
        ],
      })
    ).toStrictEqual({
      results: [
        {
          path: "/report.txt",
          artifactId,
        },
        {
          path: "/missing.txt",
          error: true,
          message: "Workspace file not found",
        },
      ],
    });
    expect(
      publishArtifactResultSchema.safeParse({
        artifactId,
        path: "/report.txt",
        filename: "report.txt",
      }).success
    ).toBe(false);
  });
});

describe("artifactDownloadUrlResponseSchema", () => {
  it("accepts the public URL-mint response", () => {
    expect(
      artifactDownloadUrlResponseSchema.parse({
        url: `https://example.r2.cloudflarestorage.com/tenants/${tenantId}/artifacts/${artifactId}/report.pdf?X-Amz-Signature=example`,
        expiresAt: iso,
      })
    ).toStrictEqual({
      url: `https://example.r2.cloudflarestorage.com/tenants/${tenantId}/artifacts/${artifactId}/report.pdf?X-Amz-Signature=example`,
      expiresAt: iso,
    });
  });
});
