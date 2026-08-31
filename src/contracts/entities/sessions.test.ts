import { describe, expect, it } from "vitest";

import {
  decideToolApprovalBodySchema,
  sessionListItemSchema,
  sessionMessagesQuerySchema,
  sessionMessagesResponseSchema,
  sessionsListResponseSchema,
  toolApprovalDecisionResponseSchema,
  toolApprovalsResponseSchema,
} from "./sessions.ts";

const sessionId = "ss_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";

const baseSession = {
  agentVersion: null,
  id: sessionId,
  messageCount: 3,
  lastMessagePreview: "Hello",
  userId: "",
  metadata: {},
  createdAt: iso,
  updatedAt: iso,
};

describe("sessionListItemSchema", () => {
  it("accepts a complete list item matching the contract shape", () => {
    expect(sessionListItemSchema.safeParse(baseSession).success).toBe(true);
  });

  it("accepts a null lastMessagePreview", () => {
    expect(
      sessionListItemSchema.safeParse({
        ...baseSession,
        lastMessagePreview: null,
      }).success
    ).toBe(true);
  });

  it("accepts a positive int32 configured Agent Version Pin", () => {
    expect(
      sessionListItemSchema.parse({ ...baseSession, agentVersion: 7 })
        .agentVersion
    ).toBe(7);
  });

  it.each([0, 1.5, 2_147_483_648])(
    "rejects malformed configured Agent Version Pin %s",
    (agentVersion) => {
      expect(
        sessionListItemSchema.safeParse({ ...baseSession, agentVersion })
          .success
      ).toBe(false);
    }
  );

  it("rejects a malformed session id", () => {
    expect(
      sessionListItemSchema.safeParse({ ...baseSession, id: "nope" }).success
    ).toBe(false);
  });

  it("requires seconds in offset datetimes", () => {
    expect(
      sessionListItemSchema.safeParse({
        ...baseSession,
        createdAt: "2026-07-04T01:00+01:00",
      }).success
    ).toBe(false);
    expect(
      sessionListItemSchema.safeParse({
        ...baseSession,
        createdAt: "2026-07-04T01:00:00+01:00",
      }).success
    ).toBe(true);
  });

  it("rejects extra fields (agentId/tenantId are not on the wire)", () => {
    expect(
      sessionListItemSchema.safeParse({
        ...baseSession,
        agentId: "ag_xxxxxxxxxxxxxxxx",
      }).success
    ).toBe(false);
    expect(
      sessionListItemSchema.safeParse({
        ...baseSession,
        tenantId: "ten_xxxxxxxxxxxxxxxx",
      }).success
    ).toBe(false);
    expect(
      sessionListItemSchema.safeParse({ ...baseSession, extra: true }).success
    ).toBe(false);
  });
});

describe("sessionsListResponseSchema", () => {
  it("is a paginated { data, nextCursor } envelope", () => {
    expect(
      sessionsListResponseSchema.parse({
        data: [baseSession],
        nextCursor: "next",
      })
    ).toStrictEqual({ data: [baseSession], nextCursor: "next" });
  });

  it("accepts a null nextCursor", () => {
    expect(
      sessionsListResponseSchema.safeParse({
        data: [],
        nextCursor: null,
      }).success
    ).toBe(true);
  });
});

describe("sessionMessagesResponseSchema", () => {
  it("accepts a paginated transcript with nextCursor and latestCursor", () => {
    expect(
      sessionMessagesResponseSchema.safeParse({
        data: [
          {
            id: "msg_1",
            role: "user",
            parts: [{ type: "text", text: "hi" }],
          },
        ],
        nextCursor: null,
        latestCursor: "cur",
      }).success
    ).toBe(true);
  });

  it("rejects a row with no parts", () => {
    expect(
      sessionMessagesResponseSchema.safeParse({
        data: [{ id: "msg_1", role: "user", parts: [] }],
        nextCursor: null,
        latestCursor: null,
      }).success
    ).toBe(false);
  });

  it("rejects a response missing latestCursor", () => {
    expect(
      sessionMessagesResponseSchema.safeParse({
        data: [],
        nextCursor: null,
      }).success
    ).toBe(false);
  });
});

describe("sessionMessagesQuerySchema", () => {
  it("defaults limit to 50", () => {
    expect(sessionMessagesQuerySchema.parse({}).limit).toBe(50);
  });

  it("rejects a limit over 200", () => {
    expect(sessionMessagesQuerySchema.safeParse({ limit: 201 }).success).toBe(
      false
    );
  });

  it("rejects a limit under 1", () => {
    expect(sessionMessagesQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false
    );
  });

  it("rejects cursor and after together", () => {
    expect(
      sessionMessagesQuerySchema.safeParse({
        cursor: "a",
        after: "b",
      }).success
    ).toBe(false);
  });

  it("accepts cursor alone and after alone", () => {
    expect(sessionMessagesQuerySchema.safeParse({ cursor: "a" }).success).toBe(
      true
    );
    expect(sessionMessagesQuerySchema.safeParse({ after: "b" }).success).toBe(
      true
    );
  });
});

describe("Tool approval contracts", () => {
  it("accepts only an approve or deny decision with an optional reason", () => {
    expect(
      decideToolApprovalBodySchema.parse({
        approved: false,
        reason: "The change is not intended.",
      })
    ).toStrictEqual({
      approved: false,
      reason: "The change is not intended.",
    });
    expect(
      decideToolApprovalBodySchema.safeParse({
        approved: true,
        toolName: "agents",
      }).success
    ).toBe(false);
    expect(
      decideToolApprovalBodySchema.safeParse({ approved: "yes" }).success
    ).toBe(false);
  });

  it("exposes trusted pending state without signatures or tenant scope", () => {
    const response = {
      data: [
        {
          approvalId: "approval-1",
          decision: "pending",
          input: { action: "deleteById", agentId: "ag_xxxxxxxxxxxxxxxx" },
          reason: null,
          toolCallId: "call-1",
          toolName: "agents",
        },
      ],
      continuation: {
        id: "tool-approval:message-1",
        state: "waiting",
      },
    };
    expect(toolApprovalsResponseSchema.parse(response)).toStrictEqual(response);
    expect(
      toolApprovalsResponseSchema.safeParse({
        ...response,
        data: [{ ...response.data[0], signature: "secret-binding" }],
      }).success
    ).toBe(false);
  });

  it("returns the stable continuation after every accepted decision", () => {
    expect(
      toolApprovalDecisionResponseSchema.parse({
        continuationId: "tool-approval:message-1",
        state: "queued",
      })
    ).toStrictEqual({
      continuationId: "tool-approval:message-1",
      state: "queued",
    });
  });
});
