import { describe, expect, it } from "vitest";
import { chatRequestBodySchema } from "./contracts/entities/chat.ts";
import {
  sessionInputSchema,
  submitSessionInputBodySchema,
} from "./contracts/entities/session-inputs.ts";
import { toolApprovalContinuationStateSchema } from "./contracts/entities/sessions.ts";
import { createMockFetch, sseStream } from "./test/fixtures.ts";
import { chatChunks, client } from "./test/generation-fixtures.ts";

const message = {
  id: "u1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "hi" }],
};

describe("client-owned input contract", () => {
  it("serializes singleton convenience as canonical messages", async () => {
    const { fetch, calls } = createMockFetch({ stream: sseStream(chatChunks) });
    await client(fetch).chat({
      agentId: "ag_0123456789abcdef",
      sessionId: "ss_0123456789abcdef",
      message,
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      messages: [message],
    });
  });
  it("accepts ordered plural input and rejects singular wire input", () => {
    expect(
      chatRequestBodySchema.safeParse({
        messages: [message, { ...message, id: "u2" }],
      }).success
    ).toBe(true);
    expect(chatRequestBodySchema.safeParse({ message }).success).toBe(false);
    expect(chatRequestBodySchema.safeParse({ messages: [] }).success).toBe(
      false
    );
  });
  it("rejects queue admission and accepts a bound not-placed receipt", () => {
    expect(
      submitSessionInputBodySchema.safeParse({
        requestId: "r1",
        message,
        whenBusy: "queue",
      }).success
    ).toBe(false);
    expect(
      sessionInputSchema.safeParse({
        requestId: "r1",
        sequence: 1,
        message,
        state: "not_placed",
        turnId: "turn_0123456789abcdef",
        createdAt: "2026-10-04T10:00:00Z",
        updatedAt: "2026-10-04T10:00:00Z",
        reason: "turn_finished",
      }).success
    ).toBe(true);
  });
  it("rejects queued approval continuation state", () => {
    expect(
      toolApprovalContinuationStateSchema.safeParse("queued").success
    ).toBe(false);
  });
});

it("sends an explicit ordered batch in one request", async () => {
  const { fetch, calls } = createMockFetch({ stream: sseStream(chatChunks) });
  const messages = [message, { ...message, id: "u2" }];
  await client(fetch).chat({
    agentId: "ag_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
    messages,
  });
  expect(calls).toHaveLength(1);
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ messages });
});

it("streams a complete approval round in one correlated cancellable request", async () => {
  const { fetch, calls } = createMockFetch({
    stream: sseStream(chatChunks),
    headers: { "x-request-id": "approval-request" },
  });
  const abortSignal = new AbortController().signal;
  const decisions = [
    { approvalId: "approval-1", approved: true },
    { approvalId: "approval-2", approved: false, reason: "Keep it" },
  ];
  const result = await client(fetch).continueChat({
    agentId: "ag_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
    decisions,
    abortSignal,
    clientRequestId: "continue-1",
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toContain("/tool-approvals/continue");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ decisions });
  expect(calls[0].init?.signal).toBe(abortSignal);
  expect(new Headers(calls[0].init?.headers).get("X-Client-Request-Id")).toBe(
    "continue-1"
  );
  expect(result.requestId).toBe("approval-request");
  expect(await result.sessionId).toBe("ss_0123456789abcdef");
  expect(await result.toResponse().text()).toContain('"delta":"Hello "');
  expect(() => result.toStream()).toThrow("already been claimed");
});
