import { describe, expect, it } from "vitest";
import {
  agentId,
  createTaskFixture,
  createTaskListItemFixture,
  createTaskRunFixture,
  iso,
  taskRunId,
} from "../test/fixtures/tasks.ts";
import {
  createTaskResponseSchema,
  createTaskRunResponseSchema,
  taskListItemSchema,
  taskRunMessagesResponseSchema,
  taskRunSchema,
  taskSchema,
  tasksListQuerySchema,
  tasksListResponseSchema,
} from "./tasks.ts";

describe("taskSchema", () => {
  it("accepts a complete on-demand task", () => {
    expect(
      taskSchema.safeParse({ ...createTaskFixture(), agentVersion: null })
        .success
    ).toBe(true);
  });

  it("requires the configured Agent Version Pin", () => {
    const { agentVersion: _, ...taskWithoutPin } = createTaskFixture();
    expect(taskSchema.safeParse(taskWithoutPin).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      taskSchema.safeParse({
        ...createTaskFixture(),
        extra: true,
      }).success
    ).toBe(false);
  });
});

describe("taskRunSchema", () => {
  it("accepts a complete run record", () => {
    expect(
      taskRunSchema.safeParse({ ...createTaskRunFixture(), agentVersion: 3 })
        .success
    ).toBe(true);
  });

  it("requires the resolved Agent Version", () => {
    const { agentVersion: _, ...runWithoutVersion } = createTaskRunFixture();
    expect(taskRunSchema.safeParse(runWithoutVersion).success).toBe(false);
  });

  it("accepts a null sessionId for a not-yet-started run", () => {
    expect(
      taskRunSchema.safeParse(
        createTaskRunFixture({
          agentVersion: 3,
          sessionId: null,
          status: "queued",
          userId: "u-42",
          metadata: { plan: "pro" },
          startedAt: null,
        })
      ).success
    ).toBe(true);
  });
});

describe("taskListItemSchema + tasksListResponseSchema", () => {
  it("embeds a compact latestRun", () => {
    const item = taskListItemSchema.parse(
      createTaskListItemFixture({
        latestRunId: taskRunId,
        latestRun: {
          id: taskRunId,
          status: "succeeded",
          finishedAt: iso,
        },
      })
    );
    expect(item.latestRun).toStrictEqual({
      id: taskRunId,
      status: "succeeded",
      finishedAt: iso,
    });
  });

  it("accepts a null latestRun", () => {
    expect(
      taskListItemSchema.safeParse(createTaskListItemFixture()).success
    ).toBe(true);
  });

  it("tasksListResponseSchema is a paginated envelope", () => {
    expect(
      tasksListResponseSchema.safeParse({
        data: [],
        nextCursor: null,
      }).success
    ).toBe(true);
  });
});

describe("tasksListQuerySchema", () => {
  it("accepts an optional agentId filter", () => {
    expect(tasksListQuerySchema.parse({ agentId }).agentId).toBe(agentId);
  });

  it("accepts an optional userId filter", () => {
    expect(tasksListQuerySchema.parse({ userId: "u-42" }).userId).toBe("u-42");
  });

  it("accepts an empty query", () => {
    expect(tasksListQuerySchema.parse({}).agentId).toBeUndefined();
  });
});

describe("createTaskResponseSchema + createTaskRunResponseSchema", () => {
  it("wraps a created task with an optional run id", () => {
    expect(
      createTaskResponseSchema.safeParse({
        task: createTaskFixture(),
        runId: null,
      }).success
    ).toBe(true);
  });

  it("returns a queued run id", () => {
    expect(
      createTaskRunResponseSchema.parse({ runId: taskRunId })
    ).toStrictEqual({ runId: taskRunId });
  });
});

describe("taskRunMessagesResponseSchema", () => {
  it("includes run state with the transcript", () => {
    expect(
      taskRunMessagesResponseSchema.parse({
        data: [],
        error: null,
        finishedAt: iso,
        latestCursor: null,
        nextCursor: null,
        status: "succeeded",
      })
    ).toMatchObject({ error: null, finishedAt: iso, status: "succeeded" });
  });

  it("requires run state", () => {
    expect(
      taskRunMessagesResponseSchema.safeParse({
        data: [],
        latestCursor: null,
        nextCursor: null,
      }).success
    ).toBe(false);
  });
});
