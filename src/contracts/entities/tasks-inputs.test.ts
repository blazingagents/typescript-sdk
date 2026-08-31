import { describe, expect, it } from "vitest";
import { agentId } from "../test/fixtures/tasks.ts";
import {
  createTaskBodySchema,
  createTaskRunBodySchema,
  taskRunStatusSchema,
  updateTaskBodySchema,
} from "./tasks.ts";

describe("createTaskBodySchema", () => {
  it("creates an on-demand task by default", () => {
    expect(
      createTaskBodySchema.parse({
        agentId,
        name: " Follow up ",
        prompt: " Draft the reply ",
      })
    ).toStrictEqual({
      agentId,
      agentVersion: null,
      name: "Follow up",
      prompt: "Draft the reply",
      schedule: null,
      enabled: true,
      submit: false,
      userId: "",
      metadata: {},
    });
  });

  it("creates a scheduled task with a cron schedule", () => {
    expect(
      createTaskBodySchema.parse({
        agentId,
        name: "Daily",
        prompt: "Summarize yesterday",
        schedule: {
          kind: "cron",
          config: { expression: " 0 9 * * * ", timezone: " UTC " },
        },
      })
    ).toStrictEqual({
      agentId,
      agentVersion: null,
      name: "Daily",
      prompt: "Summarize yesterday",
      schedule: {
        kind: "cron",
        config: { expression: "0 9 * * *", timezone: "UTC" },
      },
      enabled: true,
      submit: false,
      userId: "",
      metadata: {},
    });
  });

  it("creates a cron task with an optional staggerMs", () => {
    expect(
      createTaskBodySchema.parse({
        agentId,
        name: "Daily",
        prompt: "Summarize yesterday",
        schedule: {
          kind: "cron",
          config: {
            expression: "0 9 * * *",
            staggerMs: 60_000,
            timezone: "UTC",
          },
        },
      })
    ).toStrictEqual({
      agentId,
      agentVersion: null,
      name: "Daily",
      prompt: "Summarize yesterday",
      schedule: {
        kind: "cron",
        config: { expression: "0 9 * * *", staggerMs: 60_000, timezone: "UTC" },
      },
      enabled: true,
      submit: false,
      userId: "",
      metadata: {},
    });
  });

  it("accepts a tenant-user userId + metadata", () => {
    expect(
      createTaskBodySchema.parse({
        agentId,
        name: "Daily",
        prompt: "Summarize yesterday",
        userId: "u-42",
        metadata: { plan: "pro" },
      })
    ).toStrictEqual({
      agentId,
      agentVersion: null,
      name: "Daily",
      prompt: "Summarize yesterday",
      schedule: null,
      enabled: true,
      submit: false,
      userId: "u-42",
      metadata: { plan: "pro" },
    });
  });

  it("allows immediate submission without an idempotency key", () => {
    expect(
      createTaskBodySchema.safeParse({
        agentId,
        name: "Run now",
        prompt: "Ship it",
        submit: true,
      }).success
    ).toBe(true);
  });

  it("accepts a positive Agent Version Pin", () => {
    expect(
      createTaskBodySchema.parse({
        agentId,
        agentVersion: 7,
        name: "Pinned",
        prompt: "Use the selected Version",
      }).agentVersion
    ).toBe(7);
  });

  it.each([0, 2_147_483_648])(
    "rejects an invalid Agent Version Pin of %s",
    (agentVersion) => {
      expect(
        createTaskBodySchema.safeParse({
          agentId,
          agentVersion,
          name: "Pinned",
          prompt: "Use the selected Version",
        }).success
      ).toBe(false);
    }
  );

  it("rejects an idempotency key when creating and submitting a task", () => {
    expect(
      createTaskBodySchema.safeParse({
        agentId,
        name: "Run now",
        prompt: "Ship it",
        submit: true,
        idempotencyKey: "once",
      }).success
    ).toBe(false);
  });

  it("rejects a malformed agentId", () => {
    expect(
      createTaskBodySchema.safeParse({
        agentId: "nope",
        name: "X",
        prompt: "Y",
      }).success
    ).toBe(false);
  });
});

describe("updateTaskBodySchema", () => {
  it("accepts partial updates", () => {
    expect(
      updateTaskBodySchema.parse({
        name: " Updated ",
        enabled: false,
      })
    ).toStrictEqual({ name: "Updated", enabled: false });
  });

  it("rejects empty updates", () => {
    expect(updateTaskBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects agentId updates (immutable)", () => {
    expect(updateTaskBodySchema.safeParse({ agentId }).success).toBe(false);
  });

  it("accepts a metadata update", () => {
    expect(
      updateTaskBodySchema.parse({ metadata: { plan: "pro" } })
    ).toStrictEqual({ metadata: { plan: "pro" } });
  });

  it.each([7, null])(
    "accepts an Agent Version Pin update of %s",
    (agentVersion) => {
      expect(updateTaskBodySchema.parse({ agentVersion })).toStrictEqual({
        agentVersion,
      });
    }
  );

  it("rejects userId on update (immutable, strict body)", () => {
    expect(updateTaskBodySchema.safeParse({ userId: "u-42" }).success).toBe(
      false
    );
  });
});

describe("createTaskRunBodySchema", () => {
  it("accepts an empty body", () => {
    expect(createTaskRunBodySchema.parse({})).toStrictEqual({});
  });

  it("accepts an idempotency key", () => {
    expect(
      createTaskRunBodySchema.parse({ idempotencyKey: "once" })
    ).toStrictEqual({ idempotencyKey: "once" });
  });
});

describe("taskRunStatusSchema", () => {
  it("accepts the six statuses including blocked", () => {
    for (const s of [
      "queued",
      "running",
      "blocked",
      "succeeded",
      "failed",
      "canceled",
    ] as const) {
      expect(taskRunStatusSchema.parse(s)).toBe(s);
    }
  });

  it("rejects an unknown status", () => {
    expect(taskRunStatusSchema.safeParse("pending").success).toBe(false);
  });
});
