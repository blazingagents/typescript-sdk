import { describe, expect, it } from "vitest";

import {
  attributionCreateInputSchema,
  metadataSchema,
  userIdSchema,
} from "./attribution.ts";

describe("userIdSchema", () => {
  it("accepts an opaque tenant-chosen string", () => {
    expect(userIdSchema.safeParse("cohand-user-42").success).toBe(true);
  });

  it("accepts the tenant-level sentinel ''", () => {
    expect(userIdSchema.safeParse("").success).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(userIdSchema.safeParse(42).success).toBe(false);
    expect(userIdSchema.safeParse(null).success).toBe(false);
  });
});

describe("metadataSchema", () => {
  it("accepts an arbitrary jsonb object", () => {
    expect(
      metadataSchema.safeParse({ plan: "pro", tags: ["a", "b"], n: 1 }).success
    ).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(metadataSchema.safeParse({}).success).toBe(true);
  });

  it("strips __proto__ from untrusted metadata", () => {
    const metadata = JSON.parse(
      '{"plan":"pro","__proto__":{"polluted":true}}'
    ) as unknown;

    expect(metadataSchema.parse(metadata)).toStrictEqual({ plan: "pro" });
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("rejects non-objects", () => {
    expect(metadataSchema.safeParse("nope").success).toBe(false);
    expect(metadataSchema.safeParse([1, 2]).success).toBe(false);
    expect(metadataSchema.safeParse(null).success).toBe(false);
  });
});

describe("attributionCreateInputSchema", () => {
  it("defaults to tenant-level attribution when omitted", () => {
    expect(attributionCreateInputSchema.parse({})).toStrictEqual({
      userId: "",
      metadata: {},
    });
  });

  it("accepts a tenant-user id + metadata", () => {
    expect(
      attributionCreateInputSchema.parse({
        userId: "u-42",
        metadata: { plan: "pro" },
      })
    ).toStrictEqual({ userId: "u-42", metadata: { plan: "pro" } });
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      attributionCreateInputSchema.safeParse({ userId: "u", extra: 1 }).success
    ).toBe(false);
  });
});
