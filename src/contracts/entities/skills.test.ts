import { describe, expect, it } from "vitest";
import {
  copySkillBodySchema,
  createSkillBodySchema,
  skillCopyResultsSchema,
  skillDetailSchema,
  skillsListResponseSchema,
} from "./skills.ts";

const iso = "2026-07-04T00:00:00.000Z";
const skill = {
  id: "skill_0123456789abcdef",
  tenantId: "ten_xxxxxxxxxxxxxxxx",
  agentId: "ag_xxxxxxxxxxxxxxxx",
  name: "ppt-writer",
  description: "Creates decks.",
  metadata: { author: "Blazing Agents" },
  createdAt: iso,
  updatedAt: iso,
};

describe("Agent-owned Skill resources", () => {
  it("accepts the exact indexed Skill and detail projections", () => {
    expect(
      skillsListResponseSchema.parse({ data: [skill], nextCursor: null })
    ).toEqual({ data: [skill], nextCursor: null });
    expect(
      skillDetailSchema.parse({
        ...skill,
        files: [{ path: "SKILL.md", sizeBytes: 100 }],
      })
    ).toEqual({
      ...skill,
      files: [{ path: "SKILL.md", sizeBytes: 100 }],
    });
  });

  it("permits omitted indexed metadata and strips legacy ownership fields", () => {
    const { metadata: _metadata, ...withoutMetadata } = skill;
    expect(skillDetailSchema.parse({ ...withoutMetadata, files: [] })).toEqual({
      ...withoutMetadata,
      files: [],
    });
    expect(
      skillDetailSchema.parse({ ...skill, files: [], ownerKind: "tenant" })
    ).not.toHaveProperty("ownerKind");
    expect(
      skillDetailSchema.parse({ ...skill, files: [], userId: "" })
    ).not.toHaveProperty("userId");
  });

  it.each([
    "skill_short",
    "skill_platform_",
    "skill_platform_Bad",
    "skill_platform_airtable",
  ])("rejects malformed or platform Skill id %s", (id) => {
    expect(
      skillDetailSchema.safeParse({ ...skill, id, files: [] }).success
    ).toBe(false);
  });
});

describe("Skill creation, upload, file, and copy contracts", () => {
  it("creates only from root SKILL.md text", () => {
    expect(
      createSkillBodySchema.parse({
        path: "SKILL.md",
        content: "---\nname: test\ndescription: Test.\n---\n",
      })
    ).toEqual({
      path: "SKILL.md",
      content: "---\nname: test\ndescription: Test.\n---\n",
    });
    expect(
      createSkillBodySchema.safeParse({ path: "nested/SKILL.md", content: "" })
        .success
    ).toBe(false);
  });

  it.each(["SKILL.md", "references/guide.md", ".config/file"])(
    "accepts safe relative file path %s",
    (path) => {
      expect(
        skillDetailSchema.parse({ ...skill, files: [{ path, sizeBytes: 1 }] })
          .files[0]?.path
      ).toBe(path);
    }
  );

  it.each(["", "/SKILL.md", "../secret", "a/../secret", "a//b", "a\u0000b"])(
    "rejects unsafe file path %s",
    (path) => {
      expect(
        skillDetailSchema.safeParse({
          ...skill,
          files: [{ path, sizeBytes: 1 }],
        }).success
      ).toBe(false);
    }
  );

  it("accepts 1–30 distinct copy destinations", () => {
    const agentIds = Array.from(
      { length: 30 },
      (_, index) => `ag_${index.toString().padStart(16, "0")}`
    );
    expect(copySkillBodySchema.parse({ agentIds })).toEqual({ agentIds });
    expect(copySkillBodySchema.safeParse({ agentIds: [] }).success).toBe(false);
    expect(
      copySkillBodySchema.safeParse({ agentIds: [agentIds[0], agentIds[0]] })
        .success
    ).toBe(false);
    expect(
      copySkillBodySchema.safeParse({
        agentIds: [...agentIds, "ag_zzzzzzzzzzzzzzzz"],
      }).success
    ).toBe(false);
  });

  it("parses ordered created and failed copy outcomes", () => {
    const results = skillCopyResultsSchema.parse([
      {
        agentId: skill.agentId,
        status: "created",
        skill: { ...skill, files: [] },
      },
      {
        agentId: skill.agentId,
        status: "failed",
        error: {
          code: "skill_name_conflict",
          message: "Name already exists.",
          details: { name: skill.name },
        },
      },
      {
        agentId: skill.agentId,
        status: "failed",
        error: {
          code: "skill_name_conflict",
          message: "Name already exists.",
          param: "name",
        },
      },
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "created",
      "failed",
      "failed",
    ]);
    expect(results[2]).not.toHaveProperty("error.param");
  });
});

describe("Skill names", () => {
  it.each(["ppt-writer", "skill123", "a", "1"])(
    "accepts valid name %s",
    (name) => {
      expect(
        skillDetailSchema.safeParse({ ...skill, name, files: [] }).success
      ).toBe(true);
    }
  );

  it.each([
    "bad name",
    "Bad",
    "docs_reader",
    "-leading",
    "trailing-",
    "double--hyphen",
    "anthropic",
    "claude",
    "",
    "x".repeat(65),
  ])("rejects invalid or reserved name %s", (name) => {
    expect(
      skillDetailSchema.safeParse({ ...skill, name, files: [] }).success
    ).toBe(false);
  });
});
