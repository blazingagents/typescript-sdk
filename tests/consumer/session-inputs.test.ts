import { createServer } from "node:http";
import {
  BlazingAgents,
  BlazingAgentsDirectChatTransport,
  type SessionInputResponse,
  type SessionInputsResponse,
  type StopSessionResponse,
} from "@blazingagents/sdk";
import {
  runSessionInputsBodySchema,
  sessionInputResponseSchema,
  sessionInputsResponseSchema,
  stopSessionBodySchema,
  submitSessionInputBodySchema,
} from "@blazingagents/sdk/contracts";
import { expect, it } from "vitest";

it("uses the installed queue contracts and receives live SSE before settlement", async () => {
  const target = {
    agentId: "ag_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
  };
  const turnId = "turn_0123456789abcdef";
  const activity = { state: "running" as const, turnId, reason: null };
  const message = {
    id: "user-1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "Compare" }],
  };
  const receipt: SessionInputResponse = {
    data: {
      requestId: "draft/1",
      sequence: 1,
      message,
      mode: "queue",
      state: "accepted",
      turnId: null,
      createdAt: "2026-10-04T10:00:00Z",
      updatedAt: "2026-10-04T10:00:00Z",
      consumedAt: null,
      reason: null,
    },
    activity,
  };
  const page: SessionInputsResponse = {
    data: [receipt.data],
    nextCursor: null,
    activity,
  };
  const stopped: StopSessionResponse = {
    stoppedTurnId: turnId,
    activity: { state: "idle", turnId: null, reason: null },
  };
  const requests: {
    url: string | undefined;
    method: string | undefined;
    body: unknown;
  }[] = [];
  const release = Promise.withResolvers<void>();
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
    }
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    requests.push({ url: request.url, method: request.method, body });
    if (
      request.url?.includes("/input-turns/") ||
      request.url?.endsWith("/inputs/run")
    ) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"type":"start","messageId":"assistant-1"}\n\n');
      await release.promise;
      response.end('data: {"type":"finish"}\n\ndata: [DONE]\n\n');
      return;
    }
    let result: unknown = receipt;
    if (request.url?.endsWith("/stop")) {
      result = stopped;
    } else if (request.url?.endsWith("/inputs/resume")) {
      result = { activity };
    } else if (request.method === "GET") {
      result = page;
    }
    response.writeHead(
      request.method === "POST" && request.url?.endsWith("/inputs") ? 202 : 200,
      { "content-type": "application/json" }
    );
    response.end(JSON.stringify(result));
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener");
    }
    const client = new BlazingAgents({
      apiKey: "ba_test",
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
    const input = { ...target, requestId: receipt.data.requestId, message };
    expect(await client.sessions.submitInput(input)).toEqual(
      sessionInputResponseSchema.parse(receipt)
    );
    expect(
      submitSessionInputBodySchema.safeParse({ requestId: ".", message })
        .success
    ).toBe(false);
    expect(
      submitSessionInputBodySchema.safeParse({ requestId: "..", message })
        .success
    ).toBe(false);
    expect(submitSessionInputBodySchema.parse(requests[0].body).whenBusy).toBe(
      "queue"
    );
    expect(await client.sessions.inputs(target)).toEqual(
      sessionInputsResponseSchema.parse(page)
    );
    await client.sessions.promoteInput({
      ...target,
      requestId: receipt.data.requestId,
    });
    await client.sessions.deleteInput({
      ...target,
      requestId: receipt.data.requestId,
    });
    expect(requests[2].url).toContain("/inputs/draft%2F1/promote");
    expect(requests[3].url).toContain("/inputs/draft%2F1");
    expect(await client.sessions.stop({ ...target, turnId })).toEqual(stopped);
    expect(stopSessionBodySchema.parse(requests[4].body)).toEqual({ turnId });
    expect(await client.sessions.resumeInputs(target)).toEqual({ activity });

    const transport = new BlazingAgentsDirectChatTransport({
      ...target,
      getClient: () => client,
    });
    const reader = (await transport.joinInputTurn({ turnId })).getReader();
    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "start", messageId: "assistant-1" },
    });
    release.resolve();
    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "finish" },
    });
    expect((await reader.read()).done).toBe(true);

    const run = await client.sessions.runInputs(target);
    expect(await run.toResponse().text()).toContain(
      '"messageId":"assistant-1"'
    );
    expect(runSessionInputsBodySchema.parse(requests.at(-1)?.body)).toEqual({});
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" && request.url?.endsWith("/inputs")
      )
    ).toHaveLength(1);
  } finally {
    release.resolve();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
