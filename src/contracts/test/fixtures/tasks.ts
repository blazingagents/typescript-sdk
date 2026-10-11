import type { z } from "zod";
import type { AgentConfig } from "../../entities/agents.ts";
import type {
  taskListItemSchema,
  taskResponseSchema,
  taskRunResponseSchema,
} from "../../entities/tasks.ts";

type Task = z.infer<typeof taskResponseSchema>;
type TaskListItem = z.infer<typeof taskListItemSchema>;
type TaskRun = z.infer<typeof taskRunResponseSchema>;

export const tenantId = "ten_xxxxxxxxxxxxxxxx";
export const agentId = "ag_xxxxxxxxxxxxxxxx";
export const taskId = "tk_xxxxxxxxxxxxxxxx";
export const taskRunId = "tr_xxxxxxxxxxxxxxxx";
export const sessionId = "ss_xxxxxxxxxxxxxxxx";
export const iso = "2026-07-04T00:00:00.000Z";
export const agentConfigFixture: AgentConfig = {
  name: "Builder",
  model: "openrouter/test-model",
  providerId: "prv_xxxxxxxxxxxxxxxx",
  thinkingLevel: null,
  instructions: "Build carefully.",
  tools: [],
  mcpConnectionIds: [],
  approvalInChat: { default: "full", overrides: [] },
  approvalInTasks: { default: "full", overrides: [] },
  autoCompaction: true,
  compactionReserveTokens: 16_384,
  memoryInjectionEnabled: false,
  metadata: {},
};

export function createTaskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
    tenantId,
    agentId,
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
    nextFireAt: null,
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
    agentConfig: agentConfigFixture,
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
