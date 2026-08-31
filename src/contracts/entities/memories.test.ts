import { describe, expect, it } from "vitest";

import {
  createMemoryBodySchema,
  memoriesListQuerySchema,
  memoriesListResponseSchema,
  memoryResponseSchema,
  memorySchema,
  memoryTextSchema,
  updateMemoryBodySchema,
} from "./memories.ts";

const tenantId = "ten_xxxxxxxxxxxxxxxx";
const agentId = "ag_xxxxxxxxxxxxxxxx";
const memoryId = "mem_xxxxxxxxxxxxxxxx";
const iso = "2026-07-18T00:00:00.000Z";

const baseMemory = {
  id: memoryId,
  tenantId,
  agentId,
  userId: "",
  text: "Prefers dark mode",
  createdAt: iso,
  updatedAt: iso,
  lastAccessedAt: iso,
};

describe("memoryTextSchema", () => {
  it("accepts text between 1 and 10240 bytes", () => {
    expect(memoryTextSchema.safeParse("a").success).toBe(true);
    expect(memoryTextSchema.safeParse("a".repeat(10_240)).success).toBe(true);
  });

  it("rejects empty text", () => {
    expect(memoryTextSchema.safeParse("").success).toBe(false);
  });

  it("rejects text over 10240 bytes", () => {
    expect(memoryTextSchema.safeParse("a".repeat(10_241)).success).toBe(false);
  });

  it("counts bytes, not characters, for multibyte text", () => {
    // "é" is 2 bytes in UTF-8 — 5120 of them fit exactly, 5121 do not.
    expect(memoryTextSchema.safeParse("é".repeat(5120)).success).toBe(true);
    expect(memoryTextSchema.safeParse("é".repeat(5121)).success).toBe(false);
  });
});

describe("memorySchema", () => {
  it("accepts the full record shape", () => {
    expect(memorySchema.parse(baseMemory)).toStrictEqual(baseMemory);
  });

  it("accepts a user-partitioned record", () => {
    expect(
      memorySchema.safeParse({ ...baseMemory, userId: "user-42" }).success
    ).toBe(true);
  });

  it("rejects a malformed memory id", () => {
    expect(memorySchema.safeParse({ ...baseMemory, id: "nope" }).success).toBe(
      false
    );
  });

  it("rejects searchVector (never leaves the database)", () => {
    expect(
      memorySchema.safeParse({ ...baseMemory, searchVector: "'dark':2" })
        .success
    ).toBe(false);
  });

  it("rejects a record missing lifecycle timestamps", () => {
    const { lastAccessedAt: _lastAccessedAt, ...withoutTouch } = baseMemory;
    expect(memorySchema.safeParse(withoutTouch).success).toBe(false);
  });
});

describe("memoryResponseSchema", () => {
  it("wraps the record under memory", () => {
    expect(memoryResponseSchema.parse({ memory: baseMemory })).toStrictEqual({
      memory: baseMemory,
    });
  });

  it("rejects extra fields", () => {
    expect(
      memoryResponseSchema.safeParse({ memory: baseMemory, extra: true })
        .success
    ).toBe(false);
  });
});

describe("memory list contracts", () => {
  it("defaults to a 50-row browse page and validates the paginated response", () => {
    expect(memoriesListQuerySchema.parse({})).toStrictEqual({ limit: 50 });
    expect(
      memoriesListResponseSchema.parse({ data: [baseMemory], nextCursor: null })
    ).toStrictEqual({ data: [baseMemory], nextCursor: null });
  });

  it("preserves an explicit general partition and trims search text", () => {
    expect(
      memoriesListQuerySchema.parse({ userId: "", search: "  dark mode  " })
    ).toStrictEqual({ userId: "", search: "dark mode", limit: 50 });
  });

  it("coerces valid limits and rejects invalid list query values", () => {
    expect(memoriesListQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(memoriesListQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false
    );
    expect(memoriesListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(memoriesListQuerySchema.safeParse({ search: "   " }).success).toBe(
      false
    );
    expect(memoriesListQuerySchema.safeParse({ cursor: "   " }).success).toBe(
      false
    );
  });

  it("rejects malformed paginated memory responses", () => {
    expect(
      memoriesListResponseSchema.safeParse({
        data: [{ ...baseMemory, searchVector: "'dark':1" }],
        nextCursor: null,
      }).success
    ).toBe(false);
  });
});

describe("createMemoryBodySchema", () => {
  it("defaults userId to '' (Agent-general)", () => {
    expect(createMemoryBodySchema.parse({ text: "hi" })).toStrictEqual({
      text: "hi",
      userId: "",
    });
  });

  it("accepts an explicit userId partition", () => {
    expect(
      createMemoryBodySchema.parse({ text: "hi", userId: "user-42" }).userId
    ).toBe("user-42");
  });

  it("rejects a missing text", () => {
    expect(createMemoryBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects over-cap text with a clean validation failure", () => {
    expect(
      createMemoryBodySchema.safeParse({ text: "a".repeat(10_241) }).success
    ).toBe(false);
  });

  it("rejects agentId in the body (path-immutable)", () => {
    expect(
      createMemoryBodySchema.safeParse({ text: "hi", agentId }).success
    ).toBe(false);
  });
});

describe("updateMemoryBodySchema", () => {
  it("accepts exactly { text }", () => {
    expect(updateMemoryBodySchema.parse({ text: "new" })).toStrictEqual({
      text: "new",
    });
  });

  it("rejects userId (immutable after creation)", () => {
    expect(
      updateMemoryBodySchema.safeParse({ text: "new", userId: "u" }).success
    ).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(updateMemoryBodySchema.safeParse({}).success).toBe(false);
  });
});
