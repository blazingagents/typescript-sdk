import { describe, expect, it } from "vitest";

import {
  createPromptBodySchema,
  parsePromptVariables,
  promptSchema,
  promptsResponseSchema,
  promptTemplateSchema,
  renderPromptTemplate,
  updatePromptBodySchema,
} from "./prompts.ts";

const tenantId = "ten_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";

describe("parsePromptVariables", () => {
  it("returns unique valid variables and all invalid variable names", () => {
    expect(
      parsePromptVariables(
        "Hello {{ name }} {{name}} {{ project_id }} {{ 1bad }} {{ project-id }} {{ }}"
      )
    ).toStrictEqual({
      invalidVariableNames: ["1bad", "project-id", ""],
      variables: ["name", "project_id"],
    });
  });

  it("returns empty lists when a prompt has no variables", () => {
    expect(parsePromptVariables("Plain prompt")).toStrictEqual({
      invalidVariableNames: [],
      variables: [],
    });
  });

  it("exposes the derived variables in order via .variables", () => {
    expect(
      parsePromptVariables("Ship {{ feature }} to {{owner}}").variables
    ).toStrictEqual(["feature", "owner"]);
  });
});

describe("promptTemplateSchema", () => {
  it("trims valid templates", () => {
    expect(promptTemplateSchema.parse("  Ship {{ feature_name }}  ")).toBe(
      "Ship {{ feature_name }}"
    );
  });

  it("rejects blank templates", () => {
    expect(promptTemplateSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects templates with invalid variables", () => {
    expect(promptTemplateSchema.safeParse("Ship {{ 1bad }}").success).toBe(
      false
    );
  });

  it("rejects templates with hyphenated variable names", () => {
    expect(
      promptTemplateSchema.safeParse("Ship {{ project-id }}").success
    ).toBe(false);
  });

  it("rejects templates with more than ten variables", () => {
    const template = Array.from(
      { length: 11 },
      (_, index) => `{{ v${index} }}`
    ).join(" ");

    expect(promptTemplateSchema.safeParse(template).success).toBe(false);
  });
});

describe("promptSchema", () => {
  it("accepts a complete prompt record", () => {
    expect(
      promptSchema.safeParse({
        id: "prompt_0123456789abcdef",
        tenantId,
        name: "Daily summary",
        template: "Summarize {{ topic }}",
        variables: ["topic"],
        userId: "",
        metadata: {},
        createdAt: iso,
        updatedAt: iso,
      }).success
    ).toBe(true);
  });

  it("rejects a malformed prompt id", () => {
    expect(
      promptSchema.safeParse({
        id: "nope",
        tenantId,
        name: "X",
        template: "Hi",
        variables: [],
        userId: "",
        metadata: {},
        createdAt: iso,
        updatedAt: iso,
      }).success
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      promptSchema.safeParse({
        id: "prompt_0123456789abcdef",
        tenantId,
        name: "X",
        template: "Hi",
        variables: [],
        userId: "",
        metadata: {},
        createdAt: iso,
        updatedAt: iso,
        extra: true,
      }).success
    ).toBe(false);
  });
});

describe("promptsResponseSchema", () => {
  it("wraps prompts under prompts", () => {
    const prompt = {
      id: "prompt_0123456789abcdef",
      tenantId,
      name: "X",
      template: "Hi",
      variables: [],
      userId: "",
      metadata: {},
      createdAt: iso,
      updatedAt: iso,
    };
    expect(promptsResponseSchema.parse({ prompts: [prompt] })).toStrictEqual({
      prompts: [prompt],
    });
  });
});

describe("createPromptBodySchema", () => {
  it("accepts a name + template, defaulting attribution", () => {
    expect(
      createPromptBodySchema.parse({
        name: "Daily",
        template: "Plan {{ feature }}",
      })
    ).toStrictEqual({
      name: "Daily",
      template: "Plan {{ feature }}",
      userId: "",
      metadata: {},
    });
  });

  it("accepts a tenant-user userId + metadata", () => {
    expect(
      createPromptBodySchema.parse({
        name: "Daily",
        template: "Plan {{ feature }}",
        userId: "u-42",
        metadata: { plan: "pro" },
      })
    ).toStrictEqual({
      name: "Daily",
      template: "Plan {{ feature }}",
      userId: "u-42",
      metadata: { plan: "pro" },
    });
  });

  it("rejects an empty name", () => {
    expect(
      createPromptBodySchema.safeParse({ name: "", template: "Hi" }).success
    ).toBe(false);
  });
});

describe("updatePromptBodySchema", () => {
  it("accepts partial updates", () => {
    expect(updatePromptBodySchema.parse({ name: "Renamed" })).toStrictEqual({
      name: "Renamed",
    });
  });

  it("accepts a metadata update", () => {
    expect(
      updatePromptBodySchema.parse({ metadata: { plan: "pro" } })
    ).toStrictEqual({ metadata: { plan: "pro" } });
  });

  it("rejects userId on update (immutable, strict body)", () => {
    expect(updatePromptBodySchema.safeParse({ userId: "u-42" }).success).toBe(
      false
    );
  });

  it("rejects empty updates", () => {
    expect(updatePromptBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("renderPromptTemplate", () => {
  it("substitutes trimmed prompt variable names", () => {
    expect(
      renderPromptTemplate("Ship {{ feature }} to {{owner}}", {
        feature: "billing",
        owner: "Alice",
      })
    ).toBe("Ship billing to Alice");
  });

  it("throws when a prompt variable value is missing", () => {
    expect(() => renderPromptTemplate("Ship {{ feature }}", {})).toThrow(
      "Missing prompt variable value: feature"
    );
  });
});
