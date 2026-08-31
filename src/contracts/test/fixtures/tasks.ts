import type { Task, TaskListItem, TaskRun } from "../../entities/tasks.ts";

export const tenantId = "ten_xxxxxxxxxxxxxxxx";
export const agentId = "ag_xxxxxxxxxxxxxxxx";
export const taskId = "tk_xxxxxxxxxxxxxxxx";
export const taskRunId = "tr_xxxxxxxxxxxxxxxx";
export const sessionId = "ss_xxxxxxxxxxxxxxxx";
export const iso = "2026-07-04T00:00:00.000Z";

export function createTaskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
    tenantId,
    agentId,
    agentVersion: null,
    name: "Follow up",
    prompt: "Draft the reply",
    schedule: null,
    enabled: true,
    activeRunId: null,
    latestRunId: null,
    userId: "",
    metadata: {},
    deletedAt: null,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}

export function createTaskListItemFixture(
  overrides: Partial<TaskListItem> = {}
): TaskListItem {
  return {
    ...createTaskFixture(overrides),
    latestRun: null,
    ...overrides,
  };
}

export function createTaskRunFixture(
  overrides: Partial<TaskRun> = {}
): TaskRun {
  return {
    id: taskRunId,
    taskId,
    tenantId,
    agentId,
    agentVersion: 1,
    sessionId,
    turnId: "turn_xxxxxxxxxxxxxxxx",
    status: "running",
    error: null,
    userId: "",
    metadata: {},
    startedAt: iso,
    finishedAt: null,
    cancelRequestedAt: null,
    canceledAt: null,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}
