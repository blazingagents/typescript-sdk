/**
 * `@blazingagents/sdk/rest` — every `/v1` resource without chat or
 * generation, so it loads without the `ai` peer dependency (React Native
 * hosts without DOM or Node APIs, Exact data modules).
 */

// biome-ignore lint/performance/noBarrelFile: package entry point
export { BlazingAgentsError } from "./errors.ts";
export { BlazingAgentsRest } from "./rest-client.ts";
export type { BlazingAgentsOptions, HttpConfig } from "./types.ts";
