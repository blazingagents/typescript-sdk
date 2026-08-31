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
    async createDownloadUrl(artifactId) {
      return await requestJson(
        config,
        `/v1/artifacts/${artifactId}/download-url`,
        { method: "POST" },
        artifactDownloadUrlResponseSchema
      );
    },
    async get(artifactId) {
      return await requestJson(
        config,
        `/v1/artifacts/${artifactId}`,
        {},
        artifactListItemSchema
      );
    },
    async list(options = {}) {
      return await requestJson(
        config,
        "/v1/artifacts",
        {
          query: {
            agentId: options.agentId,
            sessionId: options.sessionId,
            cursor: options.cursor,
          },
        },
        artifactsListResponseSchema
      );
    },
    async delete(artifactId) {
      await requestJson<void>(config, `/v1/artifacts/${artifactId}`, {
        method: "DELETE",
      });
    },
  };
}
