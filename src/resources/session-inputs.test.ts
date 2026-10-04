import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BlazingAgents } from "../client.ts";
import { defineFunction } from "../functions.ts";
import { createMockFetch, sseStream } from "../test/fixtures.ts";

const target = {
  agentId: "ag_0123456789abcdef",
  sessionId: "ss_0123456789abcdef",
};
const turnId = "turn_0123456789abcdef";
const base = "http://localhost:8787";
const path = `${base}/v1/agents/${target.agentId}/sessions/${target.sessionId}`;
const message = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Compare costs" }],
};
const activity = { state: "running", turnId, reason: null };
const data = {
  requestId: "draft/one?two#three",
  sequence: 1,
  message,
  mode: "queue",
  state: "accepted",
  turnId: null,
  createdAt: "2026-10-04T10:00:00Z",
  updatedAt: "2026-10-04T10:00:00Z",
  consumedAt: null,
  reason: null,
};
const response = { data, activity };
const functionEvent = {
  type: "data-ba-function-call",
  data: {
    id: "fc_0123456789abcdef",
    name: "lookup",
    input: { query: "costs" },
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  },
  transient: true,
};
const chunks = [
  { type: "start", messageId: "assistant-1" },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "Hello" },
  { type: "text-end", id: "t" },
  { type: "finish" },
];

function client(fetch: ReturnType<typeof createMockFetch>["fetch"]) {
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: base, fetch });
}

describe("durable session inputs", () => {
  it("preserves request identity and payload across retries and user scoping", async () => {
    const { fetch, calls } = createMockFetch({ body: response, status: 202 });
    const scoped = client(fetch).forUser("alice");
    const input = { ...target, requestId: data.requestId, message };
    await expect(scoped.sessions.submitInput(input)).resolves.toEqual(response);
    await scoped.sessions.submitInput(input);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.init?.body)).toEqual([
      JSON.stringify({ requestId: data.requestId, message }),
      JSON.stringify({ requestId: data.requestId, message }),
    ]);
    expect(calls[0].url).toBe(`${path}/inputs`);
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("X-BA-User-Id")).toBe(
      "alice"
    );
  });

  it("submits steering with caller cancellation without serializing the signal", async () => {
    const { fetch, calls } = createMockFetch({ body: response });
    const abortSignal = new AbortController().signal;
    await client(fetch).sessions.submitInput({
      ...target,
      requestId: data.requestId,
      message,
      whenBusy: "steer",
      abortSignal,
    });
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ requestId: data.requestId, message, whenBusy: "steer" })
    );
    expect(calls[0].init?.signal).toBe(abortSignal);
  });

  it("recovers ordered receipts with a pagination cursor and background activity", async () => {
    const body = {
      data: [
        data,
        { ...data, requestId: "second", sequence: 2, state: "uncertain" },
      ],
      nextCursor: "next",
      activity,
    };
    const { fetch, calls } = createMockFetch({ body });
    await expect(
      client(fetch).sessions.inputs({
        ...target,
        includeCompleted: false,
        limit: 200,
        cursor: "a+/=",
      })
    ).resolves.toEqual(body);
    expect(calls[0].url).toBe(
      `${path}/inputs?includeCompleted=false&limit=200&cursor=a%2B%2F%3D`
    );
    await client(fetch).sessions.inputs(target);
    expect(calls[1].url).toBe(`${path}/inputs`);
  });

  it.each(["promoteInput", "deleteInput"] as const)(
    "%s encodes identity as one path segment without resubmission",
    async (method) => {
      const { fetch, calls } = createMockFetch({ body: response });
      const abortSignal = new AbortController().signal;
      await expect(
        client(fetch).sessions[method]({
          ...target,
          requestId: data.requestId,
          abortSignal,
        })
      ).resolves.toEqual(response);
      expect(calls[0].url).toBe(
        `${path}/inputs/draft%2Fone%3Ftwo%23three${method === "promoteInput" ? "/promote" : ""}`
      );
      expect(calls[0].init?.method).toBe(
        method === "promoteInput" ? "POST" : "DELETE"
      );
      expect(calls[0].init?.body).toBeNull();
      expect(calls[0].init?.signal).toBe(abortSignal);
    }
  );

  it.each(["promoteInput", "deleteInput"] as const)(
    "%s rejects URL dot segments before any request",
    async (method) => {
      const { fetch, calls } = createMockFetch({ body: response });
      for (const requestId of [".", ".."]) {
        await expect(
          client(fetch).sessions[method]({ ...target, requestId })
        ).rejects.toThrow("URL dot segment");
      }
      expect(calls).toHaveLength(0);
    }
  );

  it.each(["promoteInput", "deleteInput"] as const)(
    "%s double-encodes literal percent-encoded dots",
    async (method) => {
      const { fetch, calls } = createMockFetch({ body: response });
      await client(fetch).sessions[method]({ ...target, requestId: "%2E%2E" });
      expect(calls[0].url).toBe(
        `${path}/inputs/%252E%252E${method === "promoteInput" ? "/promote" : ""}`
      );
      expect(new URL(calls[0].url).pathname).toContain("/inputs/%252E%252E");
    }
  );

  it("fences Stop to one Turn while reporting its running successor", async () => {
    const body = {
      stoppedTurnId: turnId,
      activity: { ...activity, turnId: "turn_abcdefghijklmnop" },
    };
    const { fetch, calls } = createMockFetch({ body });
    await expect(
      client(fetch).sessions.stop({ ...target, turnId })
    ).resolves.toEqual(body);
    expect(calls[0].url).toBe(`${path}/stop`);
    expect(calls[0].init?.body).toBe(JSON.stringify({ turnId }));
  });

  it("resumes pending inputs without sending a new message or hiding executor pause", async () => {
    const body = {
      activity: {
        state: "paused",
        turnId: null,
        reason: "function_executor_required",
      },
    };
    const { fetch, calls } = createMockFetch({ body });
    await expect(client(fetch).sessions.resumeInputs(target)).resolves.toEqual(
      body
    );
    expect(calls[0].url).toBe(`${path}/inputs/resume`);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeNull();
  });

  it.each(["input_idempotency_conflict", "input_not_pending", "session_busy"])(
    "preserves %s without retrying or fabricating identity",
    async (code) => {
      const { fetch, calls } = createMockFetch({
        status: 409,
        body: { error: { code, message: "Conflict" } },
      });
      await expect(
        client(fetch).sessions.submitInput({
          ...target,
          requestId: data.requestId,
          message,
        })
      ).rejects.toMatchObject({ code, status: 409 });
      expect(calls).toHaveLength(1);
    }
  );

  it("rejects malformed receipt responses", async () => {
    const { fetch } = createMockFetch({
      body: { data: { ...data, sequence: -1 }, activity },
    });
    await expect(
      client(fetch).sessions.submitInput({
        ...target,
        requestId: data.requestId,
        message,
      })
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("input Turn streams", () => {
  it.each(["joinInputTurn", "runInputs"] as const)(
    "%s streams observer output and removes private function events",
    async (method) => {
      const { fetch, calls } = createMockFetch({
        stream: sseStream([...chunks, functionEvent]),
      });
      const abortSignal = new AbortController().signal;
      const sessions = client(fetch).sessions;
      const result =
        method === "joinInputTurn"
          ? await sessions.joinInputTurn({ ...target, turnId, abortSignal })
          : await sessions.runInputs({ ...target, abortSignal });
      const output = result.toResponse();
      expect(output.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
      const text = await output.text();
      expect(text).toContain('"messageId":"assistant-1"');
      expect(text).toContain('"delta":"Hello"');
      expect(text).not.toContain("data-ba-function-call");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        `${path}/${method === "joinInputTurn" ? `input-turns/${turnId}` : "inputs/run"}`
      );
      expect(calls[0].init?.method).toBe(
        method === "joinInputTurn" ? "GET" : "POST"
      );
      expect(calls[0].init?.body).toBe(
        method === "joinInputTurn" ? null : "{}"
      );
      expect(calls[0].init?.signal).toBe(abortSignal);
      expect(() => result.toStream()).toThrow("already been claimed");
    }
  );

  it.each(["joinInputTurn", "runInputs"] as const)(
    "%s executes caller functions through the existing claim/result protocol",
    async (method) => {
      const execute = vi.fn(() => ({ found: true }));
      const functions = {
        lookup: defineFunction({
          description: "Lookup",
          inputSchema: z.object({ query: z.string() }),
          execute,
        }),
      };
      const pending = Promise.withResolvers<void>();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(functionEvent)}\n\n`)
          );
          await pending.promise;
          for await (const chunk of sseStream(chunks)) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      const streamed = createMockFetch({ stream });
      const claimed = createMockFetch({ body: { claimed: true } });
      const resolved = createMockFetch({ body: { accepted: true } });
      const fetch: ReturnType<typeof createMockFetch>["fetch"] = async (
        url,
        init
      ) => {
        if (url.endsWith("/claim")) {
          return await claimed.fetch(url, init);
        }
        if (url.endsWith("/result")) {
          const accepted = await resolved.fetch(url, init);
          pending.resolve();
          return accepted;
        }
        return await streamed.fetch(url, init);
      };
      const sessions = client(fetch).sessions;
      const result =
        method === "joinInputTurn"
          ? await sessions.joinInputTurn({ ...target, turnId, functions })
          : await sessions.runInputs({ ...target, functions });
      const text = await result.toResponse().text();
      expect(text).toContain('"delta":"Hello"');
      expect(text).not.toContain("data-ba-function-call");
      expect(execute).toHaveBeenCalledOnce();
      expect(execute).toHaveBeenCalledWith(
        { query: "costs" },
        expect.objectContaining({ idempotencyKey: "fc_0123456789abcdef" })
      );
      expect(claimed.calls).toHaveLength(1);
      expect(resolved.calls).toHaveLength(1);
      expect(JSON.parse(String(resolved.calls[0].init?.body))).toMatchObject({
        outcome: { kind: "output", value: { found: true } },
      });
      if (method === "runInputs") {
        expect(JSON.parse(String(streamed.calls[0].init?.body))).toEqual({
          functions: {
            lookup: {
              description: "Lookup",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
          },
        });
      }
    }
  );
});
