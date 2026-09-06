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

function fileUrl(
  agentId: string,
  input: { path: string; skillId: string }
): string {
  const path = input.path.split("/").map(encodeURIComponent).join("/");
  return `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(input.skillId)}/files/${path}`;
}

export function createAgentSkillsResource(
  config: HttpConfig,
  agentId: string
): AgentSkillsResource {
  return {
    async copy({ skillId, to, abortSignal }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}/copies`,
        { json: to, method: "POST", signal: abortSignal },
        skillCopyResultsSchema
      );
    },
    async create({ abortSignal, ...body }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills`,
        { json: body, method: "POST", signal: abortSignal },
        skillDetailSchema
      );
    },
    async delete({ skillId, abortSignal }) {
      await requestJson<void>(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
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
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
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
        `/v1/agents/${encodeURIComponent(agentId)}/skills`,
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
        `/v1/agents/${encodeURIComponent(agentId)}/skills/upload`,
        { body: form, method: "POST", signal: abortSignal },
        skillDetailSchema
      );
    },
  };
}
