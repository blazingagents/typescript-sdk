import {
  type CreatePromptBody,
  type PromptResponse,
  type PromptsResponse,
  promptResponseSchema,
  promptsResponseSchema,
  type UpdatePromptBody,
} from "../contracts/entities/prompts.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface PromptsResource {
  /**
   * Creates the Prompt.
   * @param input - creation fields; optional abortSignal.
   * @returns The prompt response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(
    input: CreatePromptBody & ResourceRequestOptions
  ): Promise<PromptResponse>;
  /**
   * Deletes the Prompt.
   * @param input - `promptId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { promptId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Retrieves the Prompt.
   * @param input - `promptId`; optional abortSignal.
   * @returns The prompt response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { promptId: string } & ResourceRequestOptions
  ): Promise<PromptResponse>;
  /**
   * Lists one page of Prompt records.
   * @param input - `userId`, `agentId`; filters and pagination options; optional abortSignal.
   * @returns The prompts response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(
    input?: {
      userId?: string;
      agentId?: string;
      cursor?: string;
      limit?: number;
    } & ResourceRequestOptions
  ): Promise<PromptsResponse>;
  /**
   * Updates the Prompt.
   * @param input - `promptId`; fields to change; optional abortSignal.
   * @returns The prompt response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  update(
    input: UpdatePromptBody & { promptId: string } & ResourceRequestOptions
  ): Promise<PromptResponse>;
}

/**
 * Builds the Prompts operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createPromptsResource(config: HttpConfig): PromptsResource {
  return {
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          json: body,
          signal: abortSignal,
          method: "POST",
        },
        promptResponseSchema
      );
    },
    async list({ userId, agentId, cursor, limit, abortSignal } = {}) {
      return await requestJson(
        config,
        "/v1/prompts",
        {
          signal: abortSignal,
          query: { userId, agentId, cursor, limit },
        },
        promptsResponseSchema
      );
    },
    async get({ promptId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/prompts/${promptId}`,
        { signal: abortSignal },
        promptResponseSchema
      );
    },
    async update({ promptId, abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/prompts/${promptId}`,
        {
          json: body,
          signal: abortSignal,
          method: "PATCH",
        },
        promptResponseSchema
      );
    },
    async delete({ promptId, abortSignal }) {
      await requestJson<void>(config, apiPath`/v1/prompts/${promptId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
