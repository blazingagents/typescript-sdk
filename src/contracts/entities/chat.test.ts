import { describe, expect, expectTypeOf, it } from "vitest";

import {
  blazingAgentsChatMessageMetadataSchema,
  type ChatRequestBody,
  chatModeSchema,
  chatRequestBodySchema,
  chatStreamErrorChunkSchema,
  chatTriggerSchema,
  type GenerationRequestBody,
  generationRequestBodySchema,
} from "./chat.ts";

const sessionId = "ss_xxxxxxxxxxxxxxxx";

describe("chatModeSchema", () => {
  it("accepts create and resume", () => {
    expect(chatModeSchema.parse("create")).toBe("create");
    expect(chatModeSchema.parse("resume")).toBe("resume");
  });

  it("rejects unknown modes", () => {
    expect(chatModeSchema.safeParse("continue").success).toBe(false);
  });
});

describe("chatTriggerSchema", () => {
  it("accepts the two triggers", () => {
    expect(chatTriggerSchema.parse("submit-message")).toBe("submit-message");
    expect(chatTriggerSchema.parse("regenerate-message")).toBe(
      "regenerate-message"
    );
  });
});

describe("blazingAgentsChatMessageMetadataSchema", () => {
  const validUsage = {
    agentId: "ag_0123456789abcdef",
    agentVersion: 3,
    commitId: "commit-1",
    completedAt: "2026-07-16T10:00:01.000Z",
    durationMs: 1000,
    errorMessage: null,
    inputTokens: 4,
    modelDurationMs: 250,
    metadata: {},
    modelId: "openrouter/test-model",
    outputTokens: 2,
    turnId: "turn_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
    startedAt: "2026-07-16T10:00:00.000Z",
    status: "succeeded",
    stepUsages: [{ inputTokens: 4, outputTokens: 2, stepNumber: 0 }],
    tenantId: "ten_0123456789abcdef",
    userId: "",
  };

  it("accepts the assistant message usage contract", () => {
    expect(
      blazingAgentsChatMessageMetadataSchema.safeParse({
        blazingAgents: { usage: validUsage },
      }).success
    ).toBe(true);
  });

  it("rejects a usage carrying fields outside the contract", () => {
    expect(
      blazingAgentsChatMessageMetadataSchema.safeParse({
        blazingAgents: { usage: { ...validUsage, removedField: 0 } },
      }).success
    ).toBe(false);
  });

  it("requires a positive int32 resolved Agent Version", () => {
    const usage = {
      agentId: "ag_0123456789abcdef",
      commitId: "commit-1",
      completedAt: "2026-07-16T10:00:01.000Z",
      durationMs: 1000,
      errorMessage: null,
      inputTokens: 4,
      modelDurationMs: 250,
      metadata: {},
      modelId: "openrouter/test-model",
      outputTokens: 2,
      turnId: "turn_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      startedAt: "2026-07-16T10:00:00.000Z",
      status: "succeeded",
      stepUsages: [],
      tenantId: "ten_0123456789abcdef",
      userId: "",
    };

    expect(
      blazingAgentsChatMessageMetadataSchema.safeParse({
        blazingAgents: { usage },
      }).success
    ).toBe(false);
    for (const agentVersion of [0, 2_147_483_648, 1.5]) {
      expect(
        blazingAgentsChatMessageMetadataSchema.safeParse({
          blazingAgents: { usage: { ...usage, agentVersion } },
        }).success
      ).toBe(false);
    }
  });
});

describe("chatRequestBodySchema", () => {
  /**
   * The body no longer carries `id` or `mode` — the platform mints the
   * `ss_` id and the URL presence (create vs resume route) is the mode.
   * Body is `{ message | promptId+variables, trigger?, messageId?,
   * userId?, metadata? }`.
   */
  const baseBody = {
    message: {
      id: "msg_1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    },
  };

  it("represents literal and stored Prompt inputs as exclusive types", () => {
    type Common = Pick<ChatRequestBody, "metadata" | "trigger" | "userId">;
    interface Literal {
      message: {
        id: string;
        parts: { text: string; type: "text" }[];
        role: "user";
      };
    }
    interface Stored {
      promptId: string;
    }
    interface Variables {
      variables: Record<string, string>;
    }

    expectTypeOf<Common & Literal>().toExtend<ChatRequestBody>();
    expectTypeOf<Common & Stored>().toExtend<ChatRequestBody>();
    expectTypeOf<Common & Stored & Variables>().toExtend<ChatRequestBody>();

    expectTypeOf<Common>().not.toExtend<ChatRequestBody>();
    expectTypeOf<Common & Variables>().not.toExtend<ChatRequestBody>();
    expectTypeOf<Common & Literal & Stored>().not.toExtend<ChatRequestBody>();
    expectTypeOf<
      Common & Literal & Variables
    >().not.toExtend<ChatRequestBody>();
    expectTypeOf<
      Common & Literal & Stored & Variables
    >().not.toExtend<ChatRequestBody>();
  });

  it("accepts a minimal body and applies defaults", () => {
    expect(chatRequestBodySchema.parse(baseBody)).toStrictEqual({
      ...baseBody,
      trigger: "submit-message",
      userId: "",
      metadata: {},
    });
  });

  it("accepts a tenant-user userId + metadata on the chat body", () => {
    expect(
      chatRequestBodySchema.parse({
        ...baseBody,
        userId: "u-42",
        metadata: { plan: "pro" },
      })
    ).toStrictEqual({
      ...baseBody,
      trigger: "submit-message",
      userId: "u-42",
      metadata: { plan: "pro" },
    });
  });

  it("accepts a positive int32 Agent Version Pin", () => {
    expect(
      chatRequestBodySchema.parse({ ...baseBody, version: 7 }).version
    ).toBe(7);
  });

  it.each([0, 1.5, 2_147_483_648])(
    "rejects malformed Agent Version Pin %s",
    (version) => {
      expect(
        chatRequestBodySchema.safeParse({ ...baseBody, version }).success
      ).toBe(false);
    }
  );

  it("accepts a regenerate body with a messageId", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...baseBody,
        trigger: "regenerate-message",
        messageId: "msg_2",
      }).success
    ).toBe(true);
  });

  it("rejects a body with no message and no promptId", () => {
    expect(chatRequestBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects a body with both message and promptId", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...baseBody,
        promptId: "prompt_0123456789abcdef",
      }).success
    ).toBe(false);
  });

  it("rejects a literal body that also carries variables (mixed shape)", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...baseBody,
        variables: { topic: "x" },
      }).success
    ).toBe(false);
  });

  it("accepts a prompt-invocation body (promptId + variables, no message)", () => {
    expect(
      chatRequestBodySchema.safeParse({
        promptId: "prompt_0123456789abcdef",
        variables: { topic: "x" },
      }).success
    ).toBe(true);
  });

  it("accepts a prompt-invocation body with no variables (template has none)", () => {
    expect(
      chatRequestBodySchema.safeParse({
        promptId: "prompt_0123456789abcdef",
      }).success
    ).toBe(true);
  });

  it("rejects a malformed promptId", () => {
    expect(chatRequestBodySchema.safeParse({ promptId: "nope" }).success).toBe(
      false
    );
  });

  it("rejects a client-minted `id` field (server mints the session id)", () => {
    expect(
      chatRequestBodySchema.safeParse({ ...baseBody, id: sessionId }).success
    ).toBe(false);
  });

  it("rejects a `mode` field (URL presence is the mode)", () => {
    expect(
      chatRequestBodySchema.safeParse({ ...baseBody, mode: "create" }).success
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      chatRequestBodySchema.safeParse({ ...baseBody, extra: true }).success
    ).toBe(false);
  });
});

describe("generationRequestBodySchema", () => {
  it("represents literal and stored Prompt inputs as exclusive types", () => {
    type Common = Pick<GenerationRequestBody, "metadata" | "output" | "userId">;
    interface Literal {
      prompt: string;
    }
    interface Stored {
      promptId: string;
    }
    interface Variables {
      variables: Record<string, string>;
    }

    expectTypeOf<Common & Literal>().toExtend<GenerationRequestBody>();
    expectTypeOf<Common & Stored>().toExtend<GenerationRequestBody>();
    expectTypeOf<
      Common & Stored & Variables
    >().toExtend<GenerationRequestBody>();

    expectTypeOf<Common>().not.toExtend<GenerationRequestBody>();
    expectTypeOf<Common & Variables>().not.toExtend<GenerationRequestBody>();
    expectTypeOf<
      Common & Literal & Stored
    >().not.toExtend<GenerationRequestBody>();
    expectTypeOf<
      Common & Literal & Variables
    >().not.toExtend<GenerationRequestBody>();
    expectTypeOf<
      Common & Literal & Stored & Variables
    >().not.toExtend<GenerationRequestBody>();
  });

  it("accepts only a positive-int32 Version Pin", () => {
    expect(
      generationRequestBodySchema.parse({
        prompt: "Summarize this.",
        output: { type: "text" },
        version: 7,
      })
    ).toMatchObject({ version: 7 });

    for (const version of [0, 2_147_483_648, 1.5]) {
      expect(
        generationRequestBodySchema.safeParse({
          prompt: "Summarize this.",
          output: { type: "text" },
          version,
        }).success
      ).toBe(false);
    }
  });

  it("accepts text and object output requests while rejecting mixed output shapes", () => {
    expect(
      generationRequestBodySchema.parse({
        prompt: "Summarize this.",
        output: { type: "text" },
      })
    ).toStrictEqual({
      prompt: "Summarize this.",
      output: { type: "text" },
      userId: "",
      metadata: {},
    });
    expect(
      generationRequestBodySchema.safeParse({
        promptId: "prompt_0123456789abcdef",
        variables: { topic: "x" },
        output: {
          type: "object",
          schema: { type: "object", properties: { name: { type: "string" } } },
        },
      }).success
    ).toBe(true);

    for (const body of [
      { prompt: "x", output: { type: "unknown" } },
      { prompt: "x", output: { type: "object" } },
      { prompt: "x", output: { type: "text", schema: { type: "object" } } },
      { prompt: "x", output: { type: "object", schema: {} } },
    ]) {
      expect(generationRequestBodySchema.safeParse(body).success).toBe(false);
    }
  });

  it("accepts any schema Zod's JSON Schema compiler can convert", () => {
    expect(
      generationRequestBodySchema.safeParse({
        prompt: "extract",
        output: {
          type: "object",
          schema: {
            type: "object",
            properties: {
              value: { anyOf: [{ type: "string" }, { type: "number" }] },
            },
          },
        },
      }).success
    ).toBe(true);
  });

  it("accepts composition roots used by TypeAdapter unions", () => {
    for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
      expect(
        generationRequestBodySchema.safeParse({
          prompt: "extract",
          output: {
            type: "object",
            schema: {
              [keyword]: [{ type: "integer" }, { type: "null" }],
            },
          },
        }).success
      ).toBe(true);
    }
  });

  it("accepts local recursive references with meaningful definitions", () => {
    const definitions = {
      $defs: {
        node: {
          type: "object",
          properties: {
            value: { type: "integer" },
            next: {
              anyOf: [{ $ref: "#/$defs/node" }, { type: "null" }],
            },
          },
        },
      },
    };
    const recursiveSchema = {
      ...definitions,
      $ref: "#/$defs/node",
    };
    const optionalRecursiveSchema = {
      ...definitions,
      anyOf: [{ $ref: "#/$defs/node" }, { type: "null" }],
    };

    for (const schema of [recursiveSchema, optionalRecursiveSchema]) {
      expect(
        generationRequestBodySchema.safeParse({
          prompt: "extract",
          output: { type: "object", schema },
        }).success
      ).toBe(true);
    }
  });

  it.each(["allOf", "anyOf", "oneOf"] as const)(
    "rejects unconstrained %s composition branches",
    (keyword) => {
      for (const branch of [
        true,
        {},
        { allOf: [{}] },
        { anyOf: [{}] },
        { oneOf: [{}] },
      ]) {
        expect(
          generationRequestBodySchema.safeParse({
            prompt: "extract",
            output: {
              type: "object",
              schema: { [keyword]: [branch] },
            },
          }).success
        ).toBe(false);
      }
    }
  );

  it.each([
    ["references", { $ref: "#/$defs/person", type: "object" }],
    ["unresolved local references", { $defs: {}, $ref: "#/$defs/person" }],
    [
      "cyclic unconstrained local references",
      { $defs: { node: { $ref: "#/$defs/node" } }, $ref: "#/$defs/node" },
    ],
    ["conditional keywords", { if: { type: "string" }, type: "object" }],
    ["empty composition roots", { anyOf: [] }],
    ["array-valued schemas", ["object"]],
  ])("rejects unsupported JSON Schema %s", (_label, schema) => {
    expect(
      generationRequestBodySchema.safeParse({
        prompt: "extract",
        output: { type: "object", schema },
      }).success
    ).toBe(false);
  });
});

describe("chatStreamErrorChunkSchema", () => {
  it("accepts the wire chunk shape { type: 'error', errorText }", () => {
    expect(
      chatStreamErrorChunkSchema.safeParse({
        type: "error",
        errorText: "Session not found.",
      }).success
    ).toBe(true);
  });

  it("rejects a non-string errorText (no JSON stuffed in the string)", () => {
    expect(
      chatStreamErrorChunkSchema.safeParse({
        type: "error",
        errorText: { code: "session_not_found" },
      }).success
    ).toBe(false);
  });

  it("rejects a chunk missing errorText", () => {
    expect(
      chatStreamErrorChunkSchema.safeParse({ type: "error" }).success
    ).toBe(false);
  });

  it("rejects a chunk with the wrong type literal", () => {
    expect(
      chatStreamErrorChunkSchema.safeParse({
        type: "data",
        errorText: "x",
      }).success
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      chatStreamErrorChunkSchema.safeParse({
        type: "error",
        errorText: "x",
        code: "session_not_found",
      }).success
    ).toBe(false);
  });
});
