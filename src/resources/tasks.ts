import {
  type CreateTaskBody,
  type CreateTaskResponse,
  type CreateTaskRunBody,
  type CreateTaskRunResponse,
  createTaskResponseSchema,
  createTaskRunResponseSchema,
  type TaskResponse,
  type TaskRunMessagesResponse,
  type TaskRunResponse,
  type TaskRunsListResponse,
  type TasksListResponse,
  taskResponseSchema,
  taskRunMessagesResponseSchema,
  taskRunResponseSchema,
  taskRunsListResponseSchema,
  tasksListResponseSchema,
  type UpdateTaskBody,
} from "../contracts/entities/tasks.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface TasksListOptions extends ResourceRequestOptions {
  agentId?: string;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface TaskRunsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
}

export interface TaskRunMessagesOptions extends ResourceRequestOptions {
  after?: string;
  cursor?: string;
  limit?: number;
}

export interface TasksResource {
  /**
   * Requests cancellation of a Task run.
   * @param input - `taskId`, `runId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  cancelRun(
    input: { taskId: string; runId: string } & ResourceRequestOptions
  ): Promise<void>;
  /**
   * Creates the Task.
   * @param input - creation fields; optional abortSignal.
   * @returns The create task response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreateTaskBody & ResourceRequestOptions
  ): Promise<CreateTaskResponse>;
  /**
   * Creates a Task run.
   * @param input - `taskId`; creation fields; optional abortSignal.
   * @returns The create task run response.
   */
  createRun(
    input: CreateTaskRunBody & { taskId: string } & ResourceRequestOptions
  ): Promise<CreateTaskRunResponse>;
  /**
   * Deletes the Task.
   * @param input - `taskId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { taskId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Retrieves the Task.
   * @param input - `taskId`; optional abortSignal.
   * @returns The task response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { taskId: string } & ResourceRequestOptions
  ): Promise<TaskResponse>;
  /**
   * Retrieves a Task run.
   * @param input - `taskId`, `runId`; optional abortSignal.
   * @returns The task run response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getRun(
    input: { taskId: string; runId: string } & ResourceRequestOptions
  ): Promise<TaskRunResponse>;
  /**
   * Lists one page of Task records.
   * @param input - filters and pagination options.
   * @returns The tasks list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: TasksListOptions): Promise<TasksListResponse>;
  /**
   * Lists one page of Task runs.
   * @param input - `taskId`; filters and pagination options.
   * @returns The task runs list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  listRuns(
    input: { taskId: string } & TaskRunsListOptions
  ): Promise<TaskRunsListResponse>;
  /**
   * Lists one page of Task run messages.
   * @param input - `taskId`, `runId`.
   * @returns The task run messages response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  runMessages(
    input: { taskId: string; runId: string } & TaskRunMessagesOptions
  ): Promise<TaskRunMessagesResponse>;
  /**
   * Updates the Task.
   * @param input - `taskId`; fields to change; optional abortSignal.
   * @returns The task response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdateTaskBody & { taskId: string } & ResourceRequestOptions
  ): Promise<TaskResponse>;
}

/**
 * `client.tasks` — CRUD + runs over `/v1/tasks`. Runs are listed/get/
 * canceled/transcripted via `/v1/tasks/:taskId/runs/...`. All lists are
 * keyset-cursored.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
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
            userId: options.userId,
          },
        },
        tasksListResponseSchema
      );
    },
    async get({ taskId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/tasks/${taskId}`,
        { signal: abortSignal },
        taskResponseSchema
      );
    },
    async update({ taskId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/tasks/${taskId}`,
        {
          json: body,
          signal: abortSignal,
          method: "PATCH",
        },
        taskResponseSchema
      );
    },
    async delete({ taskId, abortSignal }) {
      await requestJson<void>(config, apiPath`/v1/tasks/${taskId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
    async createRun({ taskId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/tasks/${taskId}/runs`,
        { json: body, method: "POST", signal: abortSignal },
        createTaskRunResponseSchema
      );
    },
    async listRuns({ taskId, ...options }) {
      return await requestJson(
        config,
        apiPath`/v1/tasks/${taskId}/runs`,
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
        apiPath`/v1/tasks/${taskId}/runs/${runId}`,
        { signal: abortSignal },
        taskRunResponseSchema
      );
    },
    async runMessages({ taskId, runId, ...options }) {
      return await requestJson(
        config,
        apiPath`/v1/tasks/${taskId}/runs/${runId}/messages`,
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
        apiPath`/v1/tasks/${taskId}/runs/${runId}/cancel`,
        { method: "POST", signal: abortSignal }
      );
    },
  };
}
