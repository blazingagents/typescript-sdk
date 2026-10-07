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
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createTasksResource(config: HttpConfig): TasksResource {
  return {
    /**
     * Creates tasks.
     */
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
    /**
     * Lists one page of tasks.
     */
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
    /**
     * Retrieves tasks.
     */
    async get({ taskId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}`,
        { signal: abortSignal },
        taskResponseSchema
      );
    },
    /**
     * Updates tasks.
     */
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
    /**
     * Deletes tasks.
     */
    async delete({ taskId, abortSignal }) {
      await requestJson<void>(config, `/v1/tasks/${taskId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
    /**
     * Creates a Task run.
     */
    async createRun({ taskId, abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs`,
        { json: body, method: "POST", signal: abortSignal },
        createTaskRunResponseSchema
      );
    },
    /**
     * Lists one page of Task runs.
     */
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
    /**
     * Retrieves a Task run.
     */
    async getRun({ taskId, runId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/tasks/${taskId}/runs/${runId}`,
        { signal: abortSignal },
        taskRunResponseSchema
      );
    },
    /**
     * Lists one page of Task run messages.
     */
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
    /**
     * Requests cancellation of a Task run.
     */
    async cancelRun({ taskId, runId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/tasks/${taskId}/runs/${runId}/cancel`,
        { method: "POST", signal: abortSignal }
      );
    },
  };
}
