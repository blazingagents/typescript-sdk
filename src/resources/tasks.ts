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
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/tasks",
        {
          json: body,
          signal: abortSignal,
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
          signal: options.abortSignal,
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
    async get({ taskId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}`,
        { signal: abortSignal },
        taskResponseSchema
      );
    },
    async update({ taskId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}`,
        {
          json: body,
          signal: abortSignal,
          method: "PATCH",
        },
        taskResponseSchema
      );
    },
    async delete({ taskId, abortSignal }) {
      await requestJson<void>(config, `/v1/tasks/${taskId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
    async createRun({ taskId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs`,
        { json: body, method: "POST", signal: abortSignal },
        createTaskRunResponseSchema
      );
    },
    async listRuns({ taskId, ...options }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs`,
        {
          signal: options.abortSignal,
          query: { cursor: options.cursor, limit: options.limit },
        },
        taskRunsListResponseSchema
      );
    },
    async getRun({ taskId, runId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs/${runId}`,
        { signal: abortSignal },
        taskRunResponseSchema
      );
    },
    async runMessages({ taskId, runId, ...options }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs/${runId}/messages`,
        {
          signal: options.abortSignal,
          query: {
            cursor: options.cursor,
            after: options.after,
            limit: options.limit,
          },
        },
        taskRunMessagesResponseSchema
      );
    },
    async cancelRun({ taskId, runId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/tasks/${taskId}/runs/${runId}/cancel`,
        { method: "POST", signal: abortSignal }
      );
    },
  };
}
