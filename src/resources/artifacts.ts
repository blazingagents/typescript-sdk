import {
  artifactDownloadUrlResponseSchema,
  artifactListItemSchema,
  artifactsListResponseSchema,
} from "../contracts/entities/artifacts.ts";
import { requestJson } from "../http.ts";
import type { ArtifactsResource, HttpConfig } from "../types.ts";

/**
 * `client.artifacts` — Tenant-level metadata and direct download URLs.
 */

export function createArtifactsResource(config: HttpConfig): ArtifactsResource {
  return {
    async createDownloadUrl({ artifactId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/artifacts/${artifactId}/download-url`,
        { method: "POST", signal: abortSignal },
        artifactDownloadUrlResponseSchema
      );
    },
    async get({ artifactId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/artifacts/${artifactId}`,
        { signal: abortSignal },
        artifactListItemSchema
      );
    },
    async list({ abortSignal, ...options } = {}) {
      return await requestJson(
        config,
        "/v1/artifacts",
        {
          signal: abortSignal,
          query: {
            agentId: options.agentId,
            sessionId: options.sessionId,
            cursor: options.cursor,
          },
        },
        artifactsListResponseSchema
      );
    },
    async delete({ artifactId, abortSignal }) {
      await requestJson<void>(config, `/v1/artifacts/${artifactId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
