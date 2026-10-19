import { describe, expect, it } from "vitest";
import { BlazingAgentsError } from "./errors.ts";
import {
  type ClientMethod,
  type ClientUnderTest,
  ids,
  methodsOf,
  operationFor,
  operations,
  samples,
  tenantClient,
  userClient,
} from "./test/contract.ts";
import { createMockFetch } from "./test/fixtures.ts";

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
