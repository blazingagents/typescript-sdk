import { describe, expect, it } from "vitest";
import { agentConfigFixture } from "../test/fixtures/tasks.ts";

import {
  latestSessionListItemSchema,
  latestSessionsListResponseSchema,
  sessionListItemSchema,
  sessionMessagesQuerySchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsListResponseSchema,
  toolApprovalDecisionSchema,
  toolApprovalsResponseSchema,
} from "./sessions.ts";

const sessionId = "ss_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";

const baseSession = {
  id: sessionId,
  messageCount: 3,
  lastMessagePreview: "Hello",
  userId: "",
  metadata: {},
  createdAt: iso,
  updatedAt: iso,
};

describe("sessionResponseSchema", () => {
  it("requires the saved config while list items remain compact", () => {
    expect(sessionResponseSchema.safeParse(baseSession).success).toBe(false);
    expect(
      sessionResponseSchema.parse({
        ...baseSession,
        agentConfig: agentConfigFixture,
        forkedFrom: null,
      })
    ).toEqual({
      ...baseSession,
      agentConfig: agentConfigFixture,
      forkedFrom: null,
    });
    expect(
      sessionListItemSchema.parse({
        ...baseSession,
        agentConfig: agentConfigFixture,
        forkedFrom: null,
      })
    ).toEqual(baseSession);
  });
});

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

  it("strips fields outside the public Session projection", () => {
    expect(
      sessionListItemSchema.parse({
        ...baseSession,
        agentId: "ag_xxxxxxxxxxxxxxxx",
      })
    ).not.toHaveProperty("agentId");
    expect(
      sessionListItemSchema.parse({
        ...baseSession,
        tenantId: "ten_xxxxxxxxxxxxxxxx",
      })
    ).not.toHaveProperty("tenantId");
    expect(
      sessionListItemSchema.parse({ ...baseSession, extra: true })
    ).not.toHaveProperty("extra");
  });
});

describe("latestSessionListItemSchema", () => {
  const agentId = "ag_xxxxxxxxxxxxxxxx";
  const agentFields = { model: null, thinkingLevel: null, status: "active" };

  it("is a session list item that also names its Agent", () => {
    expect(
      latestSessionListItemSchema.parse({
        ...baseSession,
        agentId,
        ...agentFields,
      })
    ).toStrictEqual({ ...baseSession, agentId, ...agentFields });
  });

  it.each(["", "ss_xxxxxxxxxxxxxxxx", "ag_short"])(
    "rejects malformed agentId %j",
    (value) => {
      expect(
        latestSessionListItemSchema.safeParse({
          ...baseSession,
          agentId: value,
          ...agentFields,
        }).success
      ).toBe(false);
    }
  );

  it("requires agentId", () => {
    expect(latestSessionListItemSchema.safeParse(baseSession).success).toBe(
      false
    );
  });

  it("paginates like the per-Agent list", () => {
    expect(
      latestSessionsListResponseSchema.parse({
        data: [{ ...baseSession, agentId, ...agentFields }],
        nextCursor: null,
      })
    ).toStrictEqual({
      data: [{ ...baseSession, agentId, ...agentFields }],
      nextCursor: null,
    });
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
            branchable: false,
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
        data: [{ id: "msg_1", role: "user", branchable: false, parts: [] }],
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
      toolApprovalDecisionSchema.parse({
        approvalId: "approval-1",
        approved: false,
        reason: "The change is not intended.",
      })
    ).toStrictEqual({
      approvalId: "approval-1",
      approved: false,
      reason: "The change is not intended.",
    });
    expect(
      toolApprovalDecisionSchema.safeParse({
        approvalId: "approval-1",
        approved: true,
        toolName: "agents",
      }).success
    ).toBe(false);
    expect(
      toolApprovalDecisionSchema.safeParse({ approved: "yes" }).success
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
      toolApprovalsResponseSchema.parse({
        ...response,
        data: [{ ...response.data[0], signature: "secret-binding" }],
      })
    ).not.toHaveProperty("data.0.signature");
  });
});

it("requires nullable provenance and a server eligibility boolean", () => {
  const detail = { ...baseSession, agentConfig: agentConfigFixture };
  expect(sessionResponseSchema.safeParse(detail).success).toBe(false);
  expect(
    sessionResponseSchema.parse({
      ...detail,
      forkedFrom: { sessionId, messageId: "assistant" },
    }).forkedFrom
  ).toEqual({ sessionId, messageId: "assistant" });
  expect(
    sessionListItemSchema.parse({ ...baseSession, forkedFrom: null })
  ).not.toHaveProperty("forkedFrom");
  const page = {
    data: [
      {
        id: "assistant",
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      },
    ],
    nextCursor: null,
    latestCursor: null,
  };
  expect(sessionMessagesResponseSchema.safeParse(page).success).toBe(false);
  expect(
    sessionMessagesResponseSchema.parse({
      ...page,
      data: [{ ...page.data[0], branchable: true }],
    }).data[0].branchable
  ).toBe(true);
  expect(
    sessionMessagesResponseSchema.safeParse({
      ...page,
      data: [{ ...page.data[0], branchable: "true" }],
    }).success
  ).toBe(false);
});
