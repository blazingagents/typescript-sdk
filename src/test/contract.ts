import { readFileSync } from "node:fs";
import { BlazingAgents } from "../client.ts";
import type { UserClient } from "../index.ts";
import type { FetchOption } from "./fixtures.ts";

/** The JSON Schema keywords the model test walks. */
export interface JsonSchema {
  $ref?: string;
  additionalProperties?: JsonSchema | boolean;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  type?: string | string[];
}

interface ContractOperation {
  credentialBearing: boolean;
  literalSegments: number;
  method: string;
  operationId: string;
  pattern: RegExp;
  /** The 2xx `application/json` body schema, if the operation has one. */
  responseSchema: JsonSchema | undefined;
  scope: string;
}

export interface ClientMethod<C> {
  invoke: (client: C, input: unknown) => unknown;
  name: string;
}

type Reach<C> = (client: C) => object;

/** A client the SDK exposes, and the contract operations it must cover. */
export interface ClientUnderTest<C> {
  create: (fetch?: FetchOption) => C;
  /** The `X-BA-User-Id` every request carries, or `null` for none. */
  scopedUserId: string | null;
  scopes: readonly string[];
}

export const contract = JSON.parse(
  readFileSync(new URL("../../spec/openapi.json", import.meta.url), "utf8")
) as {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        responses?: Record<
          string,
          { content?: { "application/json"?: { schema: JsonSchema } } }
        >;
        "x-credential-bearing"?: boolean;
        "x-scope"?: string;
      }
    >
  >;
};

/** API-key operations: the contract marks each with an `x-scope`. */
export const operations: ContractOperation[] = Object.entries(
  contract.paths
).flatMap(([path, item]) =>
  Object.entries(item).flatMap(([method, operation]) =>
    operation.operationId === undefined || operation["x-scope"] === undefined
      ? []
      : [
          {
            method: method.toUpperCase(),
            operationId: operation.operationId,
            pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`),
            literalSegments: path
              .split("/")
              .filter((segment) => !segment.startsWith("{")).length,
            scope: operation["x-scope"],
            credentialBearing: operation["x-credential-bearing"] === true,
            responseSchema: Object.entries(operation.responses ?? {}).find(
              ([status]) => status.startsWith("2")
            )?.[1].content?.["application/json"]?.schema,
          },
        ]
  )
);

export const ids = {
  agentId: "ag_0123456789abcdef",
  artifactId: "at_0123456789abcdef",
  mcpConnectionId: "mcp_0123456789abcdef",
  memoryId: "mem_0123456789abcdef",
  promptId: "prompt_0123456789abcdef",
  runId: "tr_0123456789abcdef",
  sessionId: "ss_0123456789abcdef",
  skillId: "skill_0123456789abcdef",
  taskId: "tk_0123456789abcdef",
  turnId: "turn_0123456789abcdef",
  workspaceId: "ws_0123456789abcdef",
};
const message = {
  id: "msg-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

/**
 * Inputs for methods that validate more than IDs before sending. Every
 * other method is called once with `ids`. Several entries observe each
 * operation a method can send. Keys name a method on either client.
 */
export const samples: Record<string, unknown[]> = {
  "agent({agentId}).skills.upload": [
    { source: { type: "zip", file: new Uint8Array() } },
  ],
  chat: [
    { agentId: ids.agentId, message },
    { agentId: ids.agentId, sessionId: ids.sessionId, message },
  ],
  "mcpConnections.reconnect": [
    {
      mcpConnectionId: ids.mcpConnectionId,
      authType: "none",
      url: "https://mcp.example.com/mcp",
    },
  ],
  "mcpConnections.update": [
    { mcpConnectionId: ids.mcpConnectionId, name: "Docs" },
  ],
  "usage.sessions": [{ sessionIds: [ids.sessionId] }],
};

export const userClient: ClientUnderTest<UserClient> = {
  create: (fetch) =>
    new BlazingAgents({ apiKey: "ba_test", fetch }).forUser("user-42"),
  scopedUserId: "user-42",
  scopes: ["end-user"],
};

export const tenantClient: ClientUnderTest<BlazingAgents> = {
  create: (fetch) => new BlazingAgents({ apiKey: "ba_test", fetch }),
  scopedUserId: null,
  scopes: ["end-user", "tenant"],
};

/** Client views that return another client rather than sending a request. */
const clientViews = new Set(["forUser", "withOptions"]);

function member(target: object, key: string): unknown {
  return (target as Record<string, unknown>)[key];
}

/** Own fields plus class methods, so `BlazingAgents` and plain objects walk alike. */
function publicEntries(target: object): [string, unknown][] {
  const prototype = Object.getPrototypeOf(target) as object;
  const methods =
    prototype === Object.prototype
      ? []
      : Object.getOwnPropertyNames(prototype).filter(
          (key) => key !== "constructor"
        );
  return [...Object.keys(target), ...methods].map((key) => [
    key,
    member(target, key),
  ]);
}

/**
 * Walks the runtime client so a method added to any resource is checked
 * without editing this test. `agent()` builds a nested client; `withOptions`
 * returns this same client shape and is compared separately.
 */
function clientMethods<C>(
  target: object,
  prefix: string,
  reach: Reach<C>
): ClientMethod<C>[] {
  return publicEntries(target).flatMap(([key, value]): ClientMethod<C>[] => {
    const name = `${prefix}${key}`;
    if (clientViews.has(name)) {
      return [];
    }
    if (name === "agent") {
      const select = (client: object) =>
        (client as Pick<UserClient, "agent">).agent({ agentId: ids.agentId });
      return clientMethods<C>(select(target), "agent({agentId}).", (client) =>
        select(reach(client))
      );
    }
    if (typeof value === "function") {
      return [
        {
          name,
          invoke: (client, input) => {
            const owner = reach(client);
            return (member(owner, key) as (input: unknown) => unknown).call(
              owner,
              input
            );
          },
        },
      ];
    }
    return clientMethods<C>(
      value as object,
      `${name}.`,
      (client) => member(reach(client), key) as object
    );
  });
}

export function methodsOf<C>(client: C & object): ClientMethod<C>[] {
  return clientMethods<C>(client, "", (root) => root as object);
}

export function operationFor(method: string, pathname: string) {
  return operations
    .filter((op) => op.method === method && op.pattern.test(pathname))
    .sort((a, b) => b.literalSegments - a.literalSegments)[0];
}
