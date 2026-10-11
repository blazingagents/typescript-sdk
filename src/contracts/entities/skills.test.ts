import { describe, expect, it } from "vitest";
import {
  copySkillBodySchema,
  createSkillBodySchema,
  skillCopyResultSchema,
  skillDetailSchema,
  skillFilePathSchema,
  skillNameSchema,
  skillSchema,
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
    expect(skillSchema.parse(skill)).toEqual(skill);
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
    expect(skillSchema.parse(withoutMetadata)).toEqual(withoutMetadata);
    expect(
      skillSchema.parse({ ...skill, ownerKind: "tenant" })
    ).not.toHaveProperty("ownerKind");
    expect(skillSchema.parse({ ...skill, userId: "" })).not.toHaveProperty(
      "userId"
    );
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
      expect(skillFilePathSchema.parse(path)).toBe(path);
    }
  );

  it.each(["", "/SKILL.md", "../secret", "a/../secret", "a//b", "a\u0000b"])(
    "rejects unsafe file path %s",
    (path) => {
      expect(skillFilePathSchema.safeParse(path).success).toBe(false);
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
    expect(
      skillCopyResultSchema.parse({
        agentId: skill.agentId,
        status: "created",
        skill: { ...skill, files: [] },
      })
    ).toMatchObject({ status: "created" });
    expect(
      skillCopyResultSchema.parse({
        agentId: skill.agentId,
        status: "failed",
        error: {
          code: "skill_name_conflict",
          message: "Name already exists.",
          details: { name: skill.name },
        },
      })
    ).toMatchObject({ status: "failed" });
    expect(
      skillCopyResultSchema.parse({
        agentId: skill.agentId,
        status: "failed",
        error: {
          code: "skill_name_conflict",
          message: "Name already exists.",
          param: "name",
        },
      })
    ).not.toHaveProperty("error.param");
  });
});

describe("SKILL.md frontmatter", () => {
  it.each(["ppt-writer", "skill123", "a", "1"])(
    "accepts valid name %s",
    (name) => {
      expect(skillNameSchema.safeParse(name).success).toBe(true);
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
    expect(skillNameSchema.safeParse(name).success).toBe(false);
  });
});
