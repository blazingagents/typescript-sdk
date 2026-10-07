import {
  skillCopyResultsSchema,
  skillDetailSchema,
  skillsListResponseSchema,
} from "../contracts/entities/skills.ts";
import {
  isRequestAborted,
  requestAbortedError,
  requestJson,
  requestStream,
} from "../http.ts";
import type { AgentSkillsResource, HttpConfig } from "../types.ts";

/**
 * Builds a Skill file URL with encoded Agent, Skill, and file path values.
 */
function fileUrl(
  agentId: string,
  input: { path: string; skillId: string }
): string {
  return `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(input.skillId)}/files?path=${encodeURIComponent(input.path)}`;
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
    /**
     * Copies skills.
     */
    async copy({ skillId, to, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}/copies`,
        { json: to, method: "POST", signal: abortSignal },
        skillCopyResultsSchema
      );
    },
    /**
     * Creates skills.
     */
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills`,
        { json: body, method: "POST", signal: abortSignal },
        skillDetailSchema
      );
    },
    /**
     * Deletes skills.
     */
    async delete({ skillId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
        { method: "DELETE", signal: abortSignal }
      );
    },
    /**
     * Deletes a Skill file.
     */
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
    /**
     * Retrieves skills.
     */
    async get({ skillId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
        { signal: abortSignal },
        skillDetailSchema
      );
    },
    /**
     * Reads Skill file bytes.
     */
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
    /**
     * Lists one page of skills.
     */
    async list({ cursor, limit, abortSignal } = {}) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills`,
        { signal: abortSignal, query: { cursor, limit } },
        skillsListResponseSchema
      );
    },
    /**
     * Replaces a Skill file with the supplied content.
     */
    async putFile({ content, abortSignal, ...input }) {
      return await requestJson(
        config,
        fileUrl(agentId, input),
        {
          body: content as BodyInit,
          method: "PUT",
          signal: abortSignal,
        },
        skillDetailSchema
      );
    },
    /**
     * Uploads a Skill archive as multipart form data.
     */
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
        `/v1/agents/${encodeURIComponent(agentId)}/skills/upload`,
        { body: form, method: "POST", signal: abortSignal },
        skillDetailSchema
      );
    },
  };
}
