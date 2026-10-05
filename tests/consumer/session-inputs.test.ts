import { createServer } from "node:http";
import {
  BlazingAgents,
  BlazingAgentsDirectChatTransport,
  type SessionInputResponse,
  type SessionInputsResponse,
  type StopSessionResponse,
} from "@blazingagents/sdk";
import {
  chatRequestBodySchema,
  continueToolApprovalsBodySchema,
  sessionInputResponseSchema,
  sessionInputsResponseSchema,
  stopSessionBodySchema,
  submitSessionInputBodySchema,
} from "@blazingagents/sdk/contracts";
import { expect, it } from "vitest";

it("uses installed steer receipts and streams explicit batches and one-call approvals", async () => {
  const target = {
    agentId: "ag_0123456789abcdef",
    sessionId: "ss_0123456789abcdef",
  };
  const turnId = "turn_0123456789abcdef";
  const activity = { state: "running" as const, turnId };
  const message = {
    id: "user-1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "Compare" }],
  };
  const second = { ...message, id: "user-2" };
  const receipt: SessionInputResponse = {
    data: {
      requestId: "draft/1",
      sequence: 1,
      message,
      state: "accepted",
      turnId,
      createdAt: "2026-10-04T10:00:00Z",
      updatedAt: "2026-10-04T10:00:00Z",
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
    activity: { state: "stopping", turnId },
  };
  const requests: {
    url: string | undefined;
    method: string | undefined;
    body: unknown;
  }[] = [];
  const release = Promise.withResolvers<void>();
  const sessionPath = `/v1/agents/${target.agentId}/sessions/${target.sessionId}`;
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
    }
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    requests.push({ url: request.url, method: request.method, body });
    if (
      request.url === sessionPath ||
      request.url?.endsWith("/tool-approvals/continue")
    ) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "x-request-id": "consumer-stream",
      });
      response.write('data: {"type":"start","messageId":"assistant-1"}\n\n');
      await release.promise;
      response.end('data: {"type":"finish"}\n\ndata: [DONE]\n\n');
      return;
    }
    let result: unknown = receipt;
    if (request.url?.endsWith("/stop")) {
      result = stopped;
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
    expect(
      await client.sessions.submitInput({
        ...target,
        requestId: receipt.data.requestId,
        message,
      })
    ).toEqual(sessionInputResponseSchema.parse(receipt));
    expect(submitSessionInputBodySchema.parse(requests[0].body)).toEqual({
      requestId: "draft/1",
      message,
    });
    expect(
      submitSessionInputBodySchema.safeParse({
        requestId: "draft/1",
        message,
        whenBusy: "queue",
      }).success
    ).toBe(false);
    expect(await client.sessions.inputs(target)).toEqual(
      sessionInputsResponseSchema.parse(page)
    );

    const transport = new BlazingAgentsDirectChatTransport({
      ...target,
      getClient: () => client,
    });
    const reader = (
      await transport.sendUserMessages({ messages: [message, second] })
    ).getReader();
    expect(requests.at(-1)).toEqual({
      url: sessionPath,
      method: "POST",
      body: { messages: [message, second] },
    });
    expect(chatRequestBodySchema.parse(requests.at(-1)?.body).messages).toEqual(
      [message, second]
    );
    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "start", messageId: "assistant-1" },
    });
    expect(await client.sessions.stop({ ...target, turnId })).toEqual(stopped);
    expect(stopSessionBodySchema.parse(requests.at(-1)?.body)).toEqual({
      turnId,
    });
    release.resolve();
    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "finish" },
    });
    expect((await reader.read()).done).toBe(true);
    const decisions = [{ approvalId: "approval-1", approved: true }];
    const continued = await client.continueChat({ ...target, decisions });
    expect(continued.requestId).toBe("consumer-stream");
    expect(await continued.toResponse().text()).toContain(
      '"messageId":"assistant-1"'
    );
    expect(
      continueToolApprovalsBodySchema.parse(requests.at(-1)?.body)
    ).toEqual({ decisions });
    expect(
      requests.filter((request) =>
        request.url?.endsWith("/tool-approvals/continue")
      )
    ).toHaveLength(1);
    const count = requests.length;
    expect(
      await transport.reconnectToStream({ chatId: "consumer" })
    ).toBeNull();
    expect(requests).toHaveLength(count);
  } finally {
    release.resolve();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
