import type { HttpConfig } from "./types.ts";

const CONFIG = Symbol("blazingAgents.config");

interface Configured {
  readonly [CONFIG]: HttpConfig;
}

/** Keeps a client's transport configuration off its enumerable surface. */
export function setClientConfig(client: object, config: HttpConfig): void {
  Object.defineProperty(client, CONFIG, { value: config });
}

export function clientConfig(client: object): HttpConfig {
  return (client as Configured)[CONFIG];
}
