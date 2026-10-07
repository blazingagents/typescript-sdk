import {
  artifactDownloadUrlResponseSchema,
  artifactListItemSchema,
  artifactsListResponseSchema,
} from "../contracts/entities/artifacts.ts";
import { requestJson } from "../http.ts";
import type { ArtifactsResource, HttpConfig } from "../types.ts";

/**
 * `client.artifacts` — Tenant-level metadata and direct download URLs.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createArtifactsResource(config: HttpConfig): ArtifactsResource {
  return {
    /**
     * Creates a temporary Artifact download URL.
     */
    async createDownloadUrl({ artifactId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/artifacts/${artifactId}/download-url`,
        { method: "POST", signal: abortSignal },
        artifactDownloadUrlResponseSchema
      );
    },
    /**
     * Retrieves artifacts.
     */
    async get({ artifactId, abortSignal }) {
      return await requestJson(
        config,
        `/v1/artifacts/${artifactId}`,
        { signal: abortSignal },
        artifactListItemSchema
      );
    },
    /**
     * Lists one page of artifacts.
     */
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
    /**
     * Deletes artifacts.
     */
    async delete({ artifactId, abortSignal }) {
      await requestJson<void>(config, `/v1/artifacts/${artifactId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
