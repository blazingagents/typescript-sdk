import { describe, expect, it } from "vitest";
import { functionCallIdSchema } from "../ids.ts";
import { chatFunctionNameSchema } from "./agent-tools.ts";
import {
  chatFunctionCallEventSchema,
  chatFunctionDefinitionSchema,
  chatFunctionDefinitionsSchema,
  chatFunctionOutcomeSchema,
  chatRequestBodySchema,
  claimChatFunctionBodySchema,
  claimChatFunctionResponseSchema,
  MAX_CHAT_FUNCTION_DEFINITIONS_BYTES,
  MAX_CHAT_FUNCTION_PAYLOAD_BYTES,
  MAX_CHAT_FUNCTIONS,
  resolveChatFunctionBodySchema,
  resolveChatFunctionResponseSchema,
  resumeToolApprovalContinuationBodySchema,
} from "./chat.ts";

const objectSchema = {
  type: "object",
  properties: { orderId: { type: "string" } },
  required: ["orderId"],
};
const definition = { description: "Get an order", inputSchema: objectSchema };
const claimRequestId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

describe("functionCallIdSchema", () => {
  it("accepts only fc_ platform ids", () => {
    expect(functionCallIdSchema.safeParse("fc_0123456789abcdef").success).toBe(
      true
    );
    expect(functionCallIdSchema.safeParse("fc_0123").success).toBe(false);
    expect(functionCallIdSchema.safeParse("tc_0123456789abcdef").success).toBe(
      false
    );
  });
});

describe("chatFunctionNameSchema", () => {
  it.each(["getOrder", "get_order", "a", "x-1", `a${"b".repeat(63)}`])(
    "accepts %s",
    (name) => {
      expect(chatFunctionNameSchema.safeParse(name).success).toBe(true);
    }
  );

  it.each([
    "",
    "1abc",
    "has space",
    "dot.name",
    `a${"b".repeat(64)}`,
    "bash",
    "activate_skill",
    "mcp__x__y",
  ])("rejects %s", (name) => {
    expect(chatFunctionNameSchema.safeParse(name).success).toBe(false);
  });
});

describe("chatFunctionDefinitionSchema", () => {
  it("accepts a description and object JSON Schema", () => {
    expect(chatFunctionDefinitionSchema.parse(definition)).toStrictEqual(
      definition
    );
  });

  it("rejects non-object roots, invalid schemas, blank descriptions, and execute", () => {
    for (const candidate of [
      { ...definition, inputSchema: { type: "string" } },
      { ...definition, inputSchema: true },
      { ...definition, inputSchema: { $ref: "#/$defs/missing" } },
      { ...definition, description: "  " },
      { ...definition, execute: "code" },
    ]) {
      expect(chatFunctionDefinitionSchema.safeParse(candidate).success).toBe(
        false
      );
    }
  });
});

describe("chatFunctionDefinitionsSchema", () => {
  it("accepts up to the function count limit", () => {
    const functions = Object.fromEntries(
      Array.from({ length: MAX_CHAT_FUNCTIONS }, (_, index) => [
        `f${index}`,
        definition,
      ])
    );
    expect(chatFunctionDefinitionsSchema.safeParse(functions).success).toBe(
      true
    );
    expect(
      chatFunctionDefinitionsSchema.safeParse({
        ...functions,
        extra: definition,
      }).success
    ).toBe(false);
  });

  it("rejects oversized definitions and reserved names", () => {
    expect(
      chatFunctionDefinitionsSchema.safeParse({
        big: {
          ...definition,
          description: "x".repeat(MAX_CHAT_FUNCTION_DEFINITIONS_BYTES),
        },
      }).success
    ).toBe(false);
    expect(
      chatFunctionDefinitionsSchema.safeParse({ read: definition }).success
    ).toBe(false);
  });

  it("is an optional chat request field", () => {
    const body = { message: { id: "m", role: "user", parts: [] } };
    expect(chatRequestBodySchema.parse(body).functions).toBeUndefined();
    expect(
      chatRequestBodySchema.parse({
        ...body,
        functions: { getOrder: definition },
      }).functions
    ).toStrictEqual({ getOrder: definition });
    expect(
      chatRequestBodySchema.safeParse({
        ...body,
        functions: { bash: definition },
      }).success
    ).toBe(false);
  });
});

describe("chatFunctionCallEventSchema", () => {
  const event = {
    type: "data-ba-function-call",
    data: {
      id: "fc_0123456789abcdef",
      name: "getOrder",
      input: { orderId: "o1" },
      deadlineAt: "2026-10-02T00:01:00.000Z",
    },
    transient: true,
  };

  it("accepts the transient ready event", () => {
    expect(chatFunctionCallEventSchema.parse(event)).toStrictEqual(event);
  });

  it("rejects non-transient, malformed, and ordinary tool events", () => {
    for (const candidate of [
      { ...event, transient: false },
      { ...event, data: { ...event.data, id: "call-1" } },
      { ...event, data: { ...event.data, deadlineAt: "soon" } },
      { type: "tool-input-available", toolCallId: "c", input: {} },
    ]) {
      expect(chatFunctionCallEventSchema.safeParse(candidate).success).toBe(
        false
      );
    }
  });
});

describe("chatFunctionOutcomeSchema", () => {
  it("accepts JSON output and error outcomes", () => {
    expect(
      chatFunctionOutcomeSchema.parse({ kind: "output", value: { a: [1] } })
    ).toStrictEqual({ kind: "output", value: { a: [1] } });
    expect(
      chatFunctionOutcomeSchema.parse({ kind: "error", message: "Failed" })
    ).toStrictEqual({ kind: "error", message: "Failed" });
    expect(
      chatFunctionOutcomeSchema.parse({ kind: "output", value: null })
    ).toStrictEqual({ kind: "output", value: null });
  });

  it("rejects non-JSON, oversized, empty-error, and unknown outcomes", () => {
    for (const candidate of [
      { kind: "output", value: Number.NaN },
      { kind: "output" },
      { kind: "output", value: "x".repeat(MAX_CHAT_FUNCTION_PAYLOAD_BYTES) },
      { kind: "error", message: "" },
      { kind: "cancelled" },
    ]) {
      expect(chatFunctionOutcomeSchema.safeParse(candidate).success).toBe(
        false
      );
    }
  });
});

describe("claim, result, and resume bodies", () => {
  it("requires a UUID claim request id", () => {
    expect(claimChatFunctionBodySchema.parse({ claimRequestId })).toStrictEqual(
      { claimRequestId }
    );
    expect(
      claimChatFunctionBodySchema.safeParse({ claimRequestId: "nonce" }).success
    ).toBe(false);
    expect(
      claimChatFunctionBodySchema.safeParse({ claimRequestId, extra: 1 })
        .success
    ).toBe(false);
  });

  it("pairs the claim request id with one outcome", () => {
    const body = {
      claimRequestId,
      outcome: { kind: "output", value: 1 },
    };
    expect(resolveChatFunctionBodySchema.parse(body)).toStrictEqual(body);
    expect(
      resolveChatFunctionBodySchema.safeParse({ claimRequestId }).success
    ).toBe(false);
  });

  it("parses acknowledgements and the empty resume body", () => {
    expect(claimChatFunctionResponseSchema.parse({ claimed: true })).toEqual({
      claimed: true,
    });
    expect(
      claimChatFunctionResponseSchema.safeParse({ claimed: false }).success
    ).toBe(false);
    expect(resolveChatFunctionResponseSchema.parse({ accepted: true })).toEqual(
      { accepted: true }
    );
    expect(resumeToolApprovalContinuationBodySchema.parse({})).toEqual({});
    expect(
      resumeToolApprovalContinuationBodySchema.safeParse({ functions: {} })
        .success
    ).toBe(false);
  });
});
