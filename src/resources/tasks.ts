import {
  createTaskResponseSchema,
  createTaskRunResponseSchema,
  taskResponseSchema,
  taskRunMessagesResponseSchema,
  taskRunResponseSchema,
  taskRunsListResponseSchema,
  tasksListResponseSchema,
} from "../contracts/entities/tasks.ts";
import { requestJson } from "../http.ts";
import type { HttpConfig, TasksResource } from "../types.ts";

/**
 * `client.tasks` — CRUD + runs over `/v1/tasks`. Runs are listed/get/
 * canceled/transcripted via `/v1/tasks/:taskId/runs/...`. All lists are
 * keyset-cursored.
 */

export function createTasksResource(config: HttpConfig): TasksResource {
  return {
    async create(body) {
      return await requestJson(
        config,
        "/v1/tasks",
        {
          json: body,
          method: "POST",
        },
        createTaskResponseSchema
      );
    },
    async list(options = {}) {
      return await requestJson(
        config,
        "/v1/tasks",
        {
          query: {
            agentId: options.agentId,
            cursor: options.cursor,
            limit: options.limit,
            // Stryker disable next-line ConditionalExpression: URL serialization omits an undefined query value.
            ...(options.userId === undefined ? {} : { userId: options.userId }),
          },
        },
        tasksListResponseSchema
      );
    },
    async get(taskId) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}`,
        {},
        taskResponseSchema
      );
    },
    async update(taskId, body) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}`,
        {
          json: body,
          method: "PATCH",
        },
        taskResponseSchema
      );
    },
    async delete(taskId) {
      await requestJson<void>(config, `/v1/tasks/${taskId}`, {
        method: "DELETE",
      });
    },
    async createRun(taskId, body = {}) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs`,
        { json: body, method: "POST" },
        createTaskRunResponseSchema
      );
    },
    async listRuns(taskId, options = {}) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs`,
        { query: { cursor: options.cursor, limit: options.limit } },
        taskRunsListResponseSchema
      );
    },
    async getRun(taskId, runId) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs/${runId}`,
        {},
        taskRunResponseSchema
      );
    },
    async runMessages(taskId, runId, options = {}) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs/${runId}/messages`,
        {
          query: {
            cursor: options.cursor,
            after: options.after,
            limit: options.limit,
          },
        },
        taskRunMessagesResponseSchema
      );
    },
    async cancelRun(taskId, runId) {
      await requestJson<void>(
        config,
        `/v1/tasks/${taskId}/runs/${runId}/cancel`,
        { method: "POST" }
      );
    },
  };
}
