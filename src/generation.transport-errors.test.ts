import { describe, expect, it, vi } from "vitest";
import { BlazingAgents } from "./client.ts";

const BASE = "http://localhost:8787";
const encoder = new TextEncoder();

function errorAfter(
  bytes: Uint8Array,
  reason: unknown = new Error("transport broke")
) {
  let emitted = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!emitted) {
        emitted = true;
        controller.enqueue(bytes);
        await new Promise((resolve) => setImmediate(resolve));
        controller.error(reason);
      }
    },
  });
}

function client(stream: ReadableStream<Uint8Array>) {
  const fetch = vi.fn(
    async () =>
      new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          location:
            "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef",
          "x-request-id": "request-generation-transport",
        },
      })
  );
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

function clientWithLockedResponse({
  location,
  requestId,
  status = 200,
}: {
  location?: string;
  requestId: string;
  status?: number;
}) {
  const response = new Response(new ReadableStream<Uint8Array>(), {
    status,
    headers: {
      ...(location ? { location } : {}),
      "x-request-id": requestId,
    },
  });
  response.body?.getReader();
  const fetch = vi.fn(async () => response);
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

function clientWithNullResponse(location?: string) {
  const fetch = vi.fn(
    async () =>
      new Response(null, {
        status: 204,
        headers: {
          ...(location ? { location } : {}),
          "x-request-id": "request-null-response",
        },
      })
  );
  return new BlazingAgents({ apiKey: "ba_test", baseUrl: BASE, fetch });
}

describe("generation transport errors", () => {
  it("wraps completion and object transport errors after observable deltas", async () => {
    const completionResult = await client(
      errorAfter(encoder.encode("hello"))
    ).completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    const completionDeltas: string[] = [];
    const consumeText = async () => {
      for await (const delta of completionResult.textStream) {
        completionDeltas.push(delta);
      }
    };
    const completionResponseText = completionResult.toResponse().text();
    await expect(consumeText()).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-generation-transport",
    });
    await expect(completionResult.text).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-generation-transport",
    });
    await expect(completionResponseText).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-generation-transport",
    });
    expect(completionDeltas.join("")).toBe("hello");

    const objectResult = await client(
      errorAfter(encoder.encode('{"ok":true}'))
    ).object({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      schema: { type: "object" },
    });
    const partials: unknown[] = [];
    const consumeObject = async () => {
      for await (const partial of objectResult.partialObjectStream) {
        partials.push(partial);
      }
    };
    const objectResponseText = objectResult.toResponse().text();
    await expect(consumeObject()).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-generation-transport",
    });
    await expect(objectResult.object).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-generation-transport",
    });
    await expect(objectResponseText).rejects.toMatchObject({
      code: "stream_error",
      requestId: "request-generation-transport",
    });
    expect(partials).toEqual([{ ok: true }]);
  });

  it("normalizes non-Error transport failures for completion and object", async () => {
    const reason = "upstream socket closed";
    const completionResult = await client(
      errorAfter(encoder.encode("hello"), reason)
    ).completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    await expect(completionResult.text).rejects.toMatchObject({
      code: "stream_error",
      message: reason,
    });

    const objectResult = await client(
      errorAfter(encoder.encode('{"ok":true}'), reason)
    ).object({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      schema: { type: "object" },
    });
    await expect(objectResult.object).rejects.toMatchObject({
      code: "stream_error",
      message: reason,
    });
  });

  it("normalizes already-claimed response bodies for every streaming operation", async () => {
    const expected = {
      code: "stream_error",
      requestId: "request-already-claimed",
    };
    const location =
      "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef";

    const chatResult = await clientWithLockedResponse({
      location,
      requestId: "request-already-claimed",
      status: 201,
    }).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(() => chatResult.toResponse()).toThrowError(
      expect.objectContaining(expected)
    );
    await expect(
      clientWithLockedResponse({
        requestId: "request-already-claimed",
      }).completion({
        agentId: "ag_0123456789abcdef",
        prompt: "hi",
      })
    ).rejects.toMatchObject(expected);
    await expect(
      clientWithLockedResponse({
        requestId: "request-already-claimed",
      }).object({
        agentId: "ag_0123456789abcdef",
        prompt: "hi",
        schema: { type: "object" },
      })
    ).rejects.toMatchObject(expected);
    const continuationResult = await clientWithLockedResponse({
      requestId: "request-already-claimed",
    }).sessions.joinToolApprovalContinuation(
      "ag_0123456789abcdef",
      "ss_0123456789abcdef",
      "tool-approval:ss:assistant"
    );
    expect(() => continuationResult.toResponse()).toThrowError(
      expect.objectContaining(expected)
    );
  });

  it("normalizes replacement Response construction failures", async () => {
    const expected = {
      code: "stream_error",
      requestId: "request-null-response",
    };
    const location =
      "/v1/agents/ag_0123456789abcdef/sessions/ss_0123456789abcdef";
    const chatResult = await clientWithNullResponse(location).chat({
      agentId: "ag_0123456789abcdef",
      message: {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    });
    expect(() => chatResult.toResponse()).toThrowError(
      expect.objectContaining(expected)
    );

    const completionResult = await clientWithNullResponse().completion({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
    });
    expect(() => completionResult.toResponse()).toThrowError(
      expect.objectContaining(expected)
    );

    const objectResult = await clientWithNullResponse().object({
      agentId: "ag_0123456789abcdef",
      prompt: "hi",
      schema: { type: "object" },
    });
    expect(() => objectResult.toResponse()).toThrowError(
      expect.objectContaining(expected)
    );

    const continuationResult =
      await clientWithNullResponse().sessions.joinToolApprovalContinuation(
        "ag_0123456789abcdef",
        "ss_0123456789abcdef",
        "tool-approval:ss:assistant"
      );
    expect(() => continuationResult.toResponse()).toThrowError(
      expect.objectContaining(expected)
    );
  });
});
