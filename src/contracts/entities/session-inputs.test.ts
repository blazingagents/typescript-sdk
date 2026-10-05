import { describe, expect, it } from "vitest";
import {
  sessionInputResponseSchema,
  sessionInputsQuerySchema,
  sessionInputsResponseSchema,
  submitSessionInputBodySchema,
} from "./session-inputs.ts";

const message = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Compare costs" }],
};
const activity = {
  state: "running",
  turnId: "turn_0123456789abcdef",
};
const receipt = {
  requestId: "draft/one?two#three",
  sequence: 1,
  message,
  state: "accepted",
  turnId: activity.turnId,
  createdAt: "2026-10-04T10:00:00Z",
  updatedAt: "2026-10-04T10:00:00Z",
  reason: null,
};

describe("session input contracts", () => {
  it.each([
    {},
    { requestId: "a" },
    { requestId: "", message },
    { requestId: ".", message },
    { requestId: "..", message },
    { requestId: "a".repeat(129), message },
    { requestId: "a", message, whenBusy: "followUp" },
    { requestId: "a", message, promptId: "prompt_0123456789abcdef" },
    { requestId: "a", message, functions: {} },
  ])("rejects an invalid submission %j", (body) => {
    expect(submitSessionInputBodySchema.safeParse(body).success).toBe(false);
  });

  it.each(["...", "a.b", "%2E", "a/b?c#d", "空白"])(
    "preserves the non-dot request identity %s",
    (requestId) => {
      expect(
        submitSessionInputBodySchema.parse({ requestId, message }).requestId
      ).toBe(requestId);
    }
  );

  it("retains native message fields and message contents on not-placed receipts", () => {
    const data = {
      ...receipt,
      state: "not_placed",
      reason: "stopped",
      message: {
        ...message,
        metadata: { source: "mobile" },
        parts: [
          {
            type: "file",
            url: "data:image/png;base64,aA==",
            mediaType: "image/png",
          },
        ],
      },
    };
    expect(
      sessionInputResponseSchema.parse({ data, activity, future: true })
    ).toEqual({ data, activity });
  });

  it.each(["accepted", "delivered", "committed", "not_placed", "uncertain"])(
    "parses %s without rewriting its lifecycle",
    (state) => {
      const data = [{ ...receipt, state }];
      expect(
        sessionInputsResponseSchema.parse({
          data,
          nextCursor: "opaque",
          activity,
        })
      ).toEqual({ data, nextCursor: "opaque", activity });
    }
  );

  it.each([
    { ...receipt, sequence: 0 },
    { ...receipt, state: "applied" },
    { ...receipt, message: { ...message, role: "assistant" } },
  ])("rejects malformed receipts %j", (data) => {
    expect(
      sessionInputResponseSchema.safeParse({ data, activity }).success
    ).toBe(false);
  });

  it("bounds receipt pagination and keeps cursor separate from change observation", () => {
    expect(sessionInputsQuerySchema.parse({})).toEqual({
      includeCompleted: false,
      limit: 100,
    });
    expect(
      sessionInputsQuerySchema.parse({
        includeCompleted: true,
        limit: 200,
        cursor: "opaque",
      })
    ).toEqual({ includeCompleted: true, limit: 200, cursor: "opaque" });
    expect(sessionInputsQuerySchema.safeParse({ limit: 201 }).success).toBe(
      false
    );
    expect(
      sessionInputsQuerySchema.safeParse({ after: "opaque" }).success
    ).toBe(false);
  });
});
