import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlazingAgents } from "./client.ts";
import { BlazingAgentsError } from "./errors.ts";
import type { UserClient } from "./index.ts";
import { createMockFetch, type FetchOption } from "./test/fixtures.ts";

interface ContractOperation {
  credentialBearing: boolean;
  literalSegments: number;
  method: string;
  operationId: string;
  pattern: RegExp;
  scope: string;
}

interface ClientMethod<C> {
  invoke: (client: C, input: unknown) => unknown;
  name: string;
}

type Reach<C> = (client: C) => object;

/** A client the SDK exposes, and the contract operations it must cover. */
interface ClientUnderTest<C> {
  create: (fetch?: FetchOption) => C;
  /** The `X-BA-User-Id` every request carries, or `null` for none. */
  scopedUserId: string | null;
  scopes: readonly string[];
}

const contract = JSON.parse(
  readFileSync(new URL("../spec/openapi.json", import.meta.url), "utf8")
) as {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        "x-credential-bearing"?: boolean;
        "x-scope"?: string;
      }
    >
  >;
};

/** API-key operations: the contract marks each with an `x-scope`. */
const operations: ContractOperation[] = Object.entries(contract.paths).flatMap(
  ([path, item]) =>
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
            },
          ]
    )
);

const ids = {
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
const samples: Record<string, unknown[]> = {
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

/**
 * Operations the SDK sends on its own while a stream from the listed methods
 * runs backend function handlers, so no direct call sends them.
 */
const internalOperations: Record<string, string[]> = {
  /** Claims a backend function call before its handler runs. */
  claimChatFunctionCall: ["chat", "continueChat"],
  /** Posts the backend function handler's result. */
  resolveChatFunctionCall: ["chat", "continueChat"],
};

const userClient: ClientUnderTest<UserClient> = {
  create: (fetch) =>
    new BlazingAgents({ apiKey: "ba_test", fetch }).forUser("user-42"),
  scopedUserId: "user-42",
  scopes: ["end-user"],
};

const tenantClient: ClientUnderTest<BlazingAgents> = {
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

function methodsOf<C>(client: C & object): ClientMethod<C>[] {
  return clientMethods<C>(client, "", (root) => root as object);
}

function operationFor(method: string, pathname: string) {
  return operations
    .filter((op) => op.method === method && op.pattern.test(pathname))
    .sort((a, b) => b.literalSegments - a.literalSegments)[0];
}

async function sentRequests<C>(
  subject: ClientUnderTest<C>,
  method: ClientMethod<C>,
  input: unknown
) {
  const { fetch, calls } = createMockFetch({
    status: 400,
    body: { error: { code: "validation_error", message: "Observed" } },
  });
  try {
    await method.invoke(subject.create(fetch), input);
  } catch {
    /** The 400 ends each call right after its request is recorded. */
  }
  return calls.map((call) => ({
    method: call.init?.method ?? "GET",
    pathname: new URL(call.url).pathname,
    userId: new Headers(call.init?.headers).get("X-BA-User-Id"),
  }));
}

/** Lists every way the client's requests diverge from its contract operations. */
async function contractProblems<C>(subject: ClientUnderTest<C>) {
  const methods = methodsOf(subject.create() as C & object);
  const names = new Set(methods.map((method) => method.name));
  const problems: string[] = [];
  const sentBy = new Map<string, string>();

  for (const method of methods) {
    const requests = (
      await Promise.all(
        (samples[method.name] ?? [ids]).map((input) =>
          sentRequests(subject, method, input)
        )
      )
    ).flat();
    if (requests.length === 0) {
      problems.push(
        `${method.name} sent no request; add its input to \`samples\``
      );
    }
    for (const request of requests) {
      const label = `${method.name} sends ${request.method} ${request.pathname}`;
      const operation = operationFor(request.method, request.pathname);
      if (request.userId !== subject.scopedUserId) {
        problems.push(`${label} with X-BA-User-Id ${request.userId}`);
      }
      if (operation === undefined) {
        problems.push(
          `${label}, which is not an API-key operation in the contract`
        );
      } else if (subject.scopes.includes(operation.scope)) {
        sentBy.set(operation.operationId, method.name);
      } else {
        problems.push(
          `${label} (${operation.operationId}), which the contract scopes to "${operation.scope}"`
        );
      }
    }
  }

  for (const [operationId, senders] of Object.entries(internalOperations)) {
    if (sentBy.has(operationId)) {
      problems.push(
        `internal operation ${operationId} is sent by ${sentBy.get(operationId)}; remove it from \`internalOperations\``
      );
    }
    for (const sender of senders.filter((name) => !names.has(name))) {
      problems.push(
        `internal operation ${operationId} names ${sender}, which this client lacks`
      );
    }
  }
  for (const operation of operations) {
    if (
      subject.scopes.includes(operation.scope) &&
      !sentBy.has(operation.operationId) &&
      !(operation.operationId in internalOperations)
    ) {
      problems.push(
        `${operation.scope} operation ${operation.operationId} (${operation.method}) is not sent by any method`
      );
    }
  }

  return { names, problems };
}

/**
 * Answers every request with a 2xx body that echoes a credential and returns
 * the operations whose method rejected it with `credential_echo`.
 */
async function credentialGuardedOperations<C>(subject: ClientUnderTest<C>) {
  const guarded = new Set<string>();
  for (const method of methodsOf(subject.create() as C & object)) {
    for (const input of samples[method.name] ?? [ids]) {
      const { fetch, calls } = createMockFetch({
        body: { data: [{ apiKey: "ba_live_echoed" }] },
      });
      try {
        await method.invoke(subject.create(fetch), input);
      } catch (error) {
        const last = calls.at(-1);
        if (
          last !== undefined &&
          BlazingAgentsError.isInstance(error) &&
          error.code === "credential_echo"
        ) {
          const operation = operationFor(
            last.init?.method ?? "GET",
            new URL(last.url).pathname
          );
          guarded.add(operation?.operationId ?? `${method.name}: unknown`);
        }
      }
    }
  }
  return guarded;
}

describe("contract coverage", () => {
  it("rejects credential echoes on exactly the contract's x-credential-bearing operations", async () => {
    const guarded = await credentialGuardedOperations(tenantClient);
    const flagged = operations
      .filter((operation) => operation.credentialBearing)
      .map((operation) => operation.operationId);

    expect(flagged.length).toBeGreaterThan(0);
    expect(guarded).toStrictEqual(new Set(flagged));
  });

  it("sends exactly the contract's end-user operations from the user client", async () => {
    const { names, problems } = await contractProblems(userClient);

    expect(problems).toStrictEqual([]);
    const user = userClient.create();
    expect(
      methodsOf(user.withOptions({ clientRequestId: "trace-1" })).map(
        (method) => method.name
      )
    ).toStrictEqual([...names]);
  });

  it("sends every API-key operation from the tenant client", async () => {
    const { names, problems } = await contractProblems(tenantClient);

    expect(problems).toStrictEqual([]);
    const tenant = tenantClient.create();
    expect(
      methodsOf(tenant.withOptions({ clientRequestId: "trace-1" })).map(
        (method) => method.name
      )
    ).toStrictEqual([...names]);
  });

  it("names only methods and end-user operations that exist", () => {
    const names = new Set(
      [userClient.create(), tenantClient.create()].flatMap((client) =>
        methodsOf<object>(client).map((method) => method.name)
      )
    );

    expect(Object.keys(samples).filter((name) => !names.has(name))).toEqual([]);
    expect(
      Object.keys(internalOperations).filter(
        (operationId) =>
          operations.find((op) => op.operationId === operationId)?.scope !==
          "end-user"
      )
    ).toEqual([]);
  });
});
