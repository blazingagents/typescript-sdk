import { describe, expect, it } from "vitest";

import {
  artifactDownloadUrlResponseSchema,
  artifactListItemSchema,
  artifactsListResponseSchema,
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

describe("Artifact filenames", () => {
  it.each(["report.pdf", "résumé 2026.txt"])(
    "accepts flat name %s",
    (filename) => {
      expect(
        artifactListItemSchema.parse({ ...artifact, filename }).filename
      ).toBe(filename);
    }
  );

  it.each(["", " ", ".", "..", "folder/report.pdf", String.raw`folder\file`])(
    "rejects non-flat name %j",
    (filename) => {
      expect(
        artifactListItemSchema.safeParse({ ...artifact, filename }).success
      ).toBe(false);
    }
  );
});

describe("active Artifact responses", () => {
  it("accepts an active Artifact with updatedAt", () => {
    expect(artifactListItemSchema.parse(artifact)).toStrictEqual(artifact);
  });

  it("strips tombstone fields", () => {
    expect(
      artifactListItemSchema.parse({ ...artifact, deletedAt: null })
    ).not.toHaveProperty("deletedAt");
  });

  it("rejects a malformed Artifact id", () => {
    expect(
      artifactListItemSchema.safeParse({ ...artifact, artifactId: "at_short" })
        .success
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
