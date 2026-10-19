import {
  type ArtifactDownloadUrlResponse,
  type ArtifactListItem,
  type ArtifactsListResponse,
  artifactDownloadUrlResponseSchema,
  artifactListItemSchema,
  artifactsListResponseSchema,
} from "../contracts/entities/artifacts.ts";
import { apiPath, requestJson } from "../http.ts";
import type { HttpConfig, ResourceRequestOptions } from "../types.ts";

export interface ArtifactsListOptions extends ResourceRequestOptions {
  agentId?: string;
  cursor?: string;
  sessionId?: string;
}

export interface ArtifactsResource {
  /**
   * Creates a temporary Artifact download URL.
   * @param input - `artifactId`; optional abortSignal.
   * @returns The artifact download url response.
   */
  createDownloadUrl(
    input: { artifactId: string } & ResourceRequestOptions
  ): Promise<ArtifactDownloadUrlResponse>;
  /**
   * Deletes the Artifact.
   * @param input - `artifactId`; optional abortSignal.
   * @returns Resolves when the operation completes.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  delete(input: { artifactId: string } & ResourceRequestOptions): Promise<void>;
  /**
   * Retrieves the Artifact.
   * @param input - `artifactId`; optional abortSignal.
   * @returns The artifact list item.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  get(
    input: { artifactId: string } & ResourceRequestOptions
  ): Promise<ArtifactListItem>;
  /**
   * Lists one page of Artifact records.
   * @param input - filters and pagination options.
   * @returns The artifacts list response.
   * @throws BlazingAgentsError - If the request fails, is aborted, or returns an invalid response.
   */
  list(input?: ArtifactsListOptions): Promise<ArtifactsListResponse>;
}

/**
 * `client.artifacts` — Tenant-level metadata and direct download URLs.
 * @param config - Shared authentication and transport configuration.
 * @returns The configured resource client.
 */
export function createArtifactsResource(config: HttpConfig): ArtifactsResource {
  return {
    async createDownloadUrl({ artifactId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/artifacts/${artifactId}/download-url`,
        { method: "POST", signal: abortSignal },
        artifactDownloadUrlResponseSchema
      );
    },
    async get({ artifactId, abortSignal }) {
      return await requestJson(
        config,
        apiPath`/v1/artifacts/${artifactId}`,
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
      await requestJson<void>(config, apiPath`/v1/artifacts/${artifactId}`, {
        method: "DELETE",
        signal: abortSignal,
      });
    },
  };
}
