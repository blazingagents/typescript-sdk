import {
  skillCopyResultsSchema,
  skillDetailSchema,
  skillsListResponseSchema,
} from "../contracts/entities/skills.ts";
import { requestJson, requestStream } from "../http.ts";
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
    async copy({ skillId, to }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}/copies`,
        { json: to, method: "POST" },
        skillCopyResultsSchema
      );
    },
    async create(body) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills`,
        { json: body, method: "POST" },
        skillDetailSchema
      );
    },
    async delete({ skillId }) {
      await requestJson<void>(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
        { method: "DELETE" }
      );
    },
    async deleteFile(input) {
      return await requestJson(
        config,
        fileUrl(agentId, input),
        {
          method: "DELETE",
        },
        skillDetailSchema
      );
    },
    async get({ skillId }) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
        {},
        skillDetailSchema
      );
    },
    async getFile(input) {
      const response = await requestStream(config, fileUrl(agentId, input));
      return new Uint8Array(await response.arrayBuffer());
    },
    async list({ cursor, limit } = {}) {
      return await requestJson(
        config,
        `/v1/agents/${encodeURIComponent(agentId)}/skills`,
        { query: { cursor, limit } },
        skillsListResponseSchema
      );
    },
    async putFile({ content, ...input }) {
      return await requestJson(
        config,
        fileUrl(agentId, input),
        {
          body: content as BodyInit,
          method: "PUT",
        },
        skillDetailSchema
      );
    },
    async upload({ source }) {
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
        { body: form, method: "POST" },
        skillDetailSchema
      );
    },
  };
}
