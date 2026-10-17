import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BlazingAgents } from "./client.ts";
import type { UserClient } from "./index.ts";
import { createMockFetch } from "./test/fixtures.ts";

interface ContractOperation {
  literalSegments: number;
  method: string;
  operationId: string;
  pattern: RegExp;
  scope: string | undefined;
}

interface UserMethod {
  invoke: (user: UserClient, input: unknown) => unknown;
  name: string;
}

type Reach = (user: UserClient) => object;

const contract = JSON.parse(
  readFileSync(new URL("../spec/openapi.json", import.meta.url), "utf8")
) as {
  paths: Record<
    string,
    Record<string, { operationId?: string; "x-scope"?: string }>
  >;
};

const operations: ContractOperation[] = Object.entries(contract.paths).flatMap(
  ([path, item]) =>
    Object.entries(item).flatMap(([method, operation]) =>
      operation.operationId === undefined
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
 * operation a method can send.
 */
const samples: Record<string, unknown[]> = {
  "agent({agentId}).skills.upload": [
    { source: { type: "zip", file: new Uint8Array() } },
  ],
  chat: [
    { agentId: ids.agentId, message },
    { agentId: ids.agentId, sessionId: ids.sessionId, message },
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

function member(target: object, key: string): unknown {
  return (target as Record<string, unknown>)[key];
}

/**
 * Walks the runtime client so a method added to any resource is checked
 * without editing this test. `agent()` builds a nested client; `withOptions`
 * returns this same client shape and is compared separately.
 */
function userMethods(
  target: object,
  prefix: string,
  reach: Reach
): UserMethod[] {
  return Object.entries(target).flatMap(([key, value]): UserMethod[] => {
    const name = `${prefix}${key}`;
    if (name === "withOptions") {
      return [];
    }
    if (name === "agent") {
      const nested: Reach = (user) => user.agent({ agentId: ids.agentId });
      return userMethods(
        (value as UserClient["agent"])({ agentId: ids.agentId }),
        "agent({agentId}).",
        nested
      );
    }
    if (typeof value === "function") {
      return [
        {
          name,
          invoke: (user, input) =>
            (member(reach(user), key) as (input: unknown) => unknown)(input),
        },
      ];
    }
    return userMethods(
      value as object,
      `${name}.`,
      (user) => member(reach(user), key) as object
    );
  });
}

function operationFor(method: string, pathname: string) {
  return operations
    .filter((op) => op.method === method && op.pattern.test(pathname))
    .sort((a, b) => b.literalSegments - a.literalSegments)[0];
}

async function sentRequests(method: UserMethod, input: unknown) {
  const { fetch, calls } = createMockFetch({
    status: 400,
    body: { error: { code: "validation_error", message: "Observed" } },
  });
  const user = new BlazingAgents({ apiKey: "ba_test", fetch }).forUser(
    "user-42"
  );
  try {
    await method.invoke(user, input);
  } catch {
    /** The 400 ends each call right after its request is recorded. */
  }
  return calls.map((call) => ({
    method: call.init?.method ?? "GET",
    pathname: new URL(call.url).pathname,
    scoped: new Headers(call.init?.headers).get("X-BA-User-Id") === "user-42",
  }));
}

it("sends exactly the contract's end-user operations from the user client", async () => {
  const user = new BlazingAgents({ apiKey: "ba_test" }).forUser("user-42");
  const methods = userMethods(user, "", (client) => client);
  const names = new Set(methods.map((method) => method.name));
  const problems: string[] = [];
  const sentBy = new Map<string, string>();

  for (const method of methods) {
    const requests = (
      await Promise.all(
        (samples[method.name] ?? [ids]).map((input) =>
          sentRequests(method, input)
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
      if (!request.scoped) {
        problems.push(`${label} without X-BA-User-Id`);
      }
      if (operation === undefined) {
        problems.push(
          `${label}, which is not an API-key operation in the contract`
        );
      } else if (operation.scope === "end-user") {
        sentBy.set(operation.operationId, method.name);
      } else {
        problems.push(
          `${label} (${operation.operationId}), which the contract scopes to "${operation.scope}"`
        );
      }
    }
  }

  for (const name of Object.keys(samples)) {
    if (!names.has(name)) {
      problems.push(`\`samples\` names ${name}, which the user client lacks`);
    }
  }
  for (const [operationId, senders] of Object.entries(internalOperations)) {
    const operation = operations.find((op) => op.operationId === operationId);
    if (operation?.scope !== "end-user") {
      problems.push(
        `internal operation ${operationId} is not an end-user operation in the contract`
      );
    }
    if (sentBy.has(operationId)) {
      problems.push(
        `internal operation ${operationId} is sent by ${sentBy.get(operationId)}; remove it from \`internalOperations\``
      );
    }
    for (const sender of senders.filter((name) => !names.has(name))) {
      problems.push(
        `internal operation ${operationId} names ${sender}, which the user client lacks`
      );
    }
  }
  for (const operation of operations) {
    if (
      operation.scope === "end-user" &&
      !sentBy.has(operation.operationId) &&
      !(operation.operationId in internalOperations)
    ) {
      problems.push(
        `end-user operation ${operation.operationId} (${operation.method}) is not sent by any user-client method`
      );
    }
  }

  expect(problems).toStrictEqual([]);
  expect(
    userMethods(
      user.withOptions({ clientRequestId: "trace-1" }),
      "",
      (client) => client
    ).map((method) => method.name)
  ).toStrictEqual([...names]);
});
