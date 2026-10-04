import { describe, expect, it } from "vitest";
import { apiErrorCodeSchema } from "../api.ts";
import {
  runSessionInputsBodySchema,
  sessionActivitySchema,
  sessionInputResponseSchema,
  sessionInputsQuerySchema,
  sessionInputsResponseSchema,
  stopSessionBodySchema,
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
  reason: null,
};
const receipt = {
  requestId: "draft/one?two#three",
  sequence: 1,
  message,
  mode: "queue",
  state: "accepted",
  turnId: null,
  createdAt: "2026-10-04T10:00:00Z",
  updatedAt: "2026-10-04T10:00:00Z",
  consumedAt: null,
  reason: null,
};

describe("session input contracts", () => {
  it("defaults submissions to queue without changing caller identity or message", () => {
    expect(
      submitSessionInputBodySchema.parse({
        requestId: receipt.requestId,
        message,
      })
    ).toEqual({ requestId: receipt.requestId, message, whenBusy: "queue" });
    expect(
      submitSessionInputBodySchema.parse({
        requestId: "steer",
        message,
        whenBusy: "steer",
      }).whenBusy
    ).toBe("steer");
  });

  it.each([
    {},
    { requestId: "a" },
    { requestId: "", message },
    { requestId: "a".repeat(129), message },
    { requestId: "a", message, whenBusy: "followUp" },
    { requestId: "a", message, promptId: "prompt_0123456789abcdef" },
    { requestId: "a", message, functions: {} },
  ])("rejects an invalid submission %j", (body) => {
    expect(submitSessionInputBodySchema.safeParse(body).success).toBe(false);
  });

  it("retains native message fields and consumed effects on cancelled receipts", () => {
    const data = {
      ...receipt,
      state: "cancelled",
      consumedAt: receipt.createdAt,
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

  it.each([
    "accepted",
    "delivered",
    "consumed",
    "committed",
    "cancelled",
    "uncertain",
  ])("parses %s without rewriting its lifecycle", (state) => {
    const data = [{ ...receipt, state }];
    expect(
      sessionInputsResponseSchema.parse({
        data,
        nextCursor: "opaque",
        activity,
      })
    ).toEqual({ data, nextCursor: "opaque", activity });
  });

  it.each([
    { ...receipt, sequence: 0 },
    { ...receipt, state: "applied" },
    { ...receipt, message: { ...message, role: "assistant" } },
  ])("rejects malformed receipts %j", (data) => {
    expect(
      sessionInputResponseSchema.safeParse({ data, activity }).success
    ).toBe(false);
  });

  it("preserves paused executor state and requires the Stop Turn fence", () => {
    expect(
      sessionActivitySchema.parse({
        state: "paused",
        turnId: null,
        reason: "function_executor_required",
      }).reason
    ).toBe("function_executor_required");
    expect(stopSessionBodySchema.parse({ turnId: activity.turnId })).toEqual({
      turnId: activity.turnId,
    });
    expect(stopSessionBodySchema.safeParse({}).success).toBe(false);
    expect(
      stopSessionBodySchema.safeParse({ turnId: "tr_0123456789abcdef" }).success
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

  it("admits only function definitions in explicit batch execution", () => {
    expect(runSessionInputsBodySchema.parse({})).toEqual({});
    expect(runSessionInputsBodySchema.parse({ functions: {} })).toEqual({
      functions: {},
    });
    expect(runSessionInputsBodySchema.safeParse({ message }).success).toBe(
      false
    );
    expect(apiErrorCodeSchema.parse("input_idempotency_conflict")).toBe(
      "input_idempotency_conflict"
    );
    expect(apiErrorCodeSchema.parse("input_not_pending")).toBe(
      "input_not_pending"
    );
  });
});
