import {
  type CreateSkillBody,
  type SkillArchiveType,
  type SkillCopyResults,
  type SkillDetail,
  type SkillsListResponse,
  skillCopyResultsSchema,
  skillDetailSchema,
  skillsListResponseSchema,
} from "../contracts/entities/skills.ts";
import {
  apiPath,
  isRequestAborted,
  requestAbortedError,
  requestJson,
  requestStream,
} from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface AgentSkillsResource {
  /**
   * Copies the Skill to the selected Agents.
   * @param input - Source `skillId`, destination `to.agentIds`, and optional abortSignal.
   * @returns The skill copy results.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  copy(
    input: {
      skillId: string;
      to: { agentIds: string[] };
    } & ResourceRequestOptions
  ): Promise<SkillCopyResults>;
  /**
   * Creates the Skill.
   * @param input - creation fields; optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  create(input: CreateSkillBody & ResourceRequestOptions): Promise<SkillDetail>;
  /**
   * Deletes the Skill.
   * @param input - `skillId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { skillId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Deletes a Skill file.
   * @param input - `skillId`, relative file `path`, and optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  deleteFile(
    input: { path: string; skillId: string } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  /**
   * Retrieves the Skill.
   * @param input - `skillId`; optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { skillId: string } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  /**
   * Reads Skill file bytes.
   * @param input - `skillId`, relative file `path`, and optional abortSignal.
   * @returns The requested file bytes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  getFile(
    input: { path: string; skillId: string } & ResourceRequestOptions
  ): Promise<Uint8Array>;
  /**
   * Lists one page of Skill records.
   * @param input - filters and pagination options.
   * @returns The skills list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: SkillsListOptions): Promise<SkillsListResponse>;
  /**
   * Replaces a Skill file with the supplied content.
   * @param input - `skillId`, relative `path`, replacement `content`, and optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  putFile(
    input: {
      content: Blob | string | Uint8Array;
      path: string;
      skillId: string;
    } & ResourceRequestOptions
  ): Promise<SkillDetail>;
  /**
   * Uploads a Skill archive as multipart form data.
   * @param input - Archive bytes in `source.file`, archive format in `source.type`, and optional abortSignal.
   * @returns The skill detail.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  upload(
    input: {
      source: { file: Blob | Uint8Array; type: SkillArchiveType };
    } & ResourceRequestOptions
  ): Promise<SkillDetail>;
}

export interface SkillsListOptions extends ResourceRequestOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Builds a Skill file URL with encoded Agent, Skill, and file path values.
 */
function fileUrl(
  agentId: string,
  input: { path: string; skillId: string }
): string {
  return apiPath`/v1/agents/${agentId}/skills/${input.skillId}/files?path=${input.path}`;
}

/**
 * Builds the Agent Skills operations using the shared HTTP configuration.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createAgentSkillsResource(
  config: HttpConfig,
  agentId: string
): AgentSkillsResource {
  return {
    async copy({ skillId, to, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/skills/${skillId}/copies`,
        { json: to, method: "POST", signal: abortSignal },
        skillCopyResultsSchema
      );
    },
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/skills`,
        { json: body, method: "POST", signal: abortSignal },
        skillDetailSchema
      );
    },
    async delete({ skillId, abortSignal }) {
      await requestJson<void>(
        config,
        apiPath`/v1/agents/${agentId}/skills/${skillId}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
    async deleteFile({ abortSignal, ...input }) {
      return await requestJson(
        config,
        fileUrl(agentId, input),
        {
          method: "DELETE",
          signal: abortSignal,
        },
        skillDetailSchema
      );
    },
    async get({ skillId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/skills/${skillId}`,
        { signal: abortSignal },
        skillDetailSchema
      );
    },
    async getFile({ abortSignal, ...input }) {
      const response = await requestStream(config, fileUrl(agentId, input), {
        signal: abortSignal,
      });
      try {
        return new Uint8Array(await response.arrayBuffer());
      } catch (cause) {
        if (isRequestAborted(cause, abortSignal)) {
          throw requestAbortedError(cause);
        }
        throw cause;
      }
    },
    async list({ cursor, limit, abortSignal } = {}) {
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/skills`,
        { signal: abortSignal, query: { cursor, limit } },
        skillsListResponseSchema
      );
    },
    async putFile({ content, abortSignal, ...input }) {
      return await requestJson(
        config,
        fileUrl(agentId, input),
        {
          body: content as BodyInit,
          headers: { "content-type": "application/octet-stream" },
          method: "PUT",
          signal: abortSignal,
        },
        skillDetailSchema
      );
    },
    async upload({ source, abortSignal }) {
      const form = new FormData();
      form.set("type", source.type);
      const file =
        source.file instanceof Blob
          ? source.file
          : new Blob([source.file as BlobPart]);
      form.set("file", file, `skill.${source.type}`);
      return await requestJson(
        config,
        apiPath`/v1/agents/${agentId}/skills/upload`,
        { body: form, method: "POST", signal: abortSignal },
        skillDetailSchema
      );
    },
  };
}
