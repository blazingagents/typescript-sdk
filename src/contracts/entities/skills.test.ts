import { describe, expect, it } from "vitest";
import {
  copySkillBodySchema,
  createSkillBodySchema,
  parseSkillMarkdownFrontmatter,
  skillArchiveTypeSchema,
  skillCopyResultSchema,
  skillDetailSchema,
  skillFilePathSchema,
  skillFrontmatterSchema,
  skillNameSchema,
  skillSchema,
  skillsListQuerySchema,
  skillsListResponseSchema,
  skillUploadBodySchema,
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

  it("permits omitted indexed metadata and rejects legacy ownership fields", () => {
    const { metadata: _metadata, ...withoutMetadata } = skill;
    expect(skillSchema.parse(withoutMetadata)).toEqual(withoutMetadata);
    expect(
      skillSchema.safeParse({ ...skill, ownerKind: "tenant" }).success
    ).toBe(false);
    expect(skillSchema.safeParse({ ...skill, userId: "" }).success).toBe(false);
  });

  it("defines the accepted cursor page", () => {
    expect(skillsListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      skillsListQuerySchema.parse({ cursor: "opaque", limit: "100" })
    ).toEqual({ cursor: "opaque", limit: 100 });
    expect(skillsListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      skillsListResponseSchema.parse({ data: [skill], nextCursor: null })
    ).toEqual({ data: [skill], nextCursor: null });
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

  it("accepts exactly zip, tar, and tar.gz archives", () => {
    expect(skillArchiveTypeSchema.options).toEqual(["zip", "tar", "tar.gz"]);
    expect(
      skillUploadBodySchema.parse({
        type: "tar.gz",
        file: new File(["bytes"], "skill.tgz"),
      }).type
    ).toBe("tar.gz");
    expect(skillArchiveTypeSchema.safeParse("tgz").success).toBe(false);
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
      skillCopyResultSchema.safeParse({
        agentId: skill.agentId,
        status: "failed",
        error: {
          code: "skill_name_conflict",
          message: "Name already exists.",
          param: "name",
        },
      }).success
    ).toBe(false);
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

  it("accepts exactly the six official fields", () => {
    const frontmatter = {
      name: "ppt-writer",
      description: "Creates decks.",
      license: "MIT",
      compatibility: "Requires PowerPoint.",
      metadata: { author: "Blazing Agents" },
      "allowed-tools": "read write",
    };
    expect(skillFrontmatterSchema.parse(frontmatter)).toEqual(frontmatter);
    expect(
      skillFrontmatterSchema.safeParse({ ...frontmatter, unknown: true })
        .success
    ).toBe(false);
  });

  it("requires string-to-string metadata and bounded compatibility", () => {
    expect(
      skillFrontmatterSchema.safeParse({
        name: "ppt-writer",
        description: "Creates decks.",
        metadata: { version: 1 },
      }).success
    ).toBe(false);
    expect(
      skillFrontmatterSchema.safeParse({
        name: "ppt-writer",
        description: "Creates decks.",
        compatibility: "x".repeat(501),
      }).success
    ).toBe(false);
  });

  it("parses CRLF YAML and preserves optional official fields", () => {
    expect(
      parseSkillMarkdownFrontmatter(
        [
          "---",
          "name: ppt-writer",
          "description: Creates decks.",
          "license: MIT",
          "metadata:",
          "  author: Blazing Agents",
          "allowed-tools: read write",
          "---",
          "# Usage",
        ].join("\r\n")
      )
    ).toEqual({
      frontmatter: {
        name: "ppt-writer",
        description: "Creates decks.",
        license: "MIT",
        metadata: { author: "Blazing Agents" },
        "allowed-tools": "read write",
      },
      success: true,
    });
  });

  it("rejects missing, malformed, non-object, unknown, and invalid frontmatter", () => {
    for (const content of [
      "# Skill",
      "---\n[bad\n---\n",
      "---\n- not\n- an-object\n---\n",
      "---\nname: valid\ndescription: Valid.\nunknown: true\n---\n",
      "---\nname: -bad\ndescription: Valid.\n---\n",
    ]) {
      expect(parseSkillMarkdownFrontmatter(content).success).toBe(false);
    }
  });
});
