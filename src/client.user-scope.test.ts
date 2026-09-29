import { describe, expect, it } from "vitest";
import { BlazingAgents } from "./client.ts";
import {
  agentRow,
  createMockFetch,
  sseStream,
  textStream,
} from "./test/fixtures.ts";

const agentId = "ag_0123456789abcdef";
const sessionId = "ss_0123456789abcdef";

describe("forUser", () => {
  it("keeps administration absent and preserves scope through withOptions", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    const tenant = new BlazingAgents({ apiKey: "ba_test", fetch });
    const user = tenant.forUser("user-42");

    expect("tenant" in user).toBe(false);
    expect("providers" in user).toBe(false);
    expect("mcpConnections" in user).toBe(false);
    expect("merchantConnection" in user).toBe(false);
    expect("overview" in user.usage).toBe(false);
    expect("getForAgent" in user.usage).toBe(false);
    await user.withOptions({ clientRequestId: "trace-1" }).agents.list();
    await tenant.agents.list();

    expect(new Headers(calls[0].init?.headers).get("X-BA-User-Id")).toBe(
      "user-42"
    );
    expect(new Headers(calls[0].init?.headers).get("x-client-request-id")).toBe(
      "trace-1"
    );
    expect(new Headers(calls[1].init?.headers).get("X-BA-User-Id")).toBeNull();
  });

  it("sends scope on multipart uploads", async () => {
    const { fetch, calls } = createMockFetch({ body: agentRow() });
    await new BlazingAgents({ apiKey: "ba_test", fetch })
      .forUser("user-42")
      .agents.uploadAvatar({
        agentId,
        file: new File(["avatar"], "avatar.png"),
      });

    expect(calls[0].init?.body).toBeInstanceOf(FormData);
    expect(new Headers(calls[0].init?.headers).get("X-BA-User-Id")).toBe(
      "user-42"
    );
  });

  it("sends scope on generation and continuation streams", async () => {
    const generated = createMockFetch({ stream: textStream(["Hello"]) });
    const user = new BlazingAgents({
      apiKey: "ba_test",
      fetch: generated.fetch,
    }).forUser("user-42");
    await user.completion({ agentId, prompt: "Hello" });
    expect(user.agent({ agentId }).skills).toBeDefined();
    expect(
      new Headers(generated.calls[0].init?.headers).get("X-BA-User-Id")
    ).toBe("user-42");

    const structured = createMockFetch({
      stream: textStream(["{}"]),
      headers: { "content-type": "application/json" },
    });
    await new BlazingAgents({ apiKey: "ba_test", fetch: structured.fetch })
      .forUser("user-42")
      .object({ agentId, prompt: "Return JSON", schema: { type: "object" } });
    expect(
      new Headers(structured.calls[0].init?.headers).get("X-BA-User-Id")
    ).toBe("user-42");

    const chatted = createMockFetch({ stream: sseStream([]) });
    await new BlazingAgents({ apiKey: "ba_test", fetch: chatted.fetch })
      .forUser("user-42")
      .chat({
        agentId,
        sessionId,
        message: {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      });
    expect(
      new Headers(chatted.calls[0].init?.headers).get("X-BA-User-Id")
    ).toBe("user-42");

    const continued = createMockFetch({ stream: sseStream([]) });
    await new BlazingAgents({ apiKey: "ba_test", fetch: continued.fetch })
      .forUser("user-42")
      .sessions.joinToolApprovalContinuation({
        agentId,
        sessionId,
        continuationId: "continue-1",
      });
    expect(
      new Headers(continued.calls[0].init?.headers).get("X-BA-User-Id")
    ).toBe("user-42");
  });

  it("rejects empty user scope", () => {
    const tenant = new BlazingAgents({ apiKey: "ba_test" });
    for (const invalid of [
      "",
      "   ",
      " leading",
      "trailing ",
      "é",
      "line\nbreak",
      "x".repeat(257),
    ]) {
      expect(() => tenant.forUser(invalid)).toThrow();
    }
  });

  it("preserves a valid scope ID exactly in HTTP Headers", async () => {
    const { fetch, calls } = createMockFetch({
      body: { data: [], nextCursor: null },
    });
    const userId = "user:/-_.@42 has space";
    await new BlazingAgents({ apiKey: "ba_test", fetch })
      .forUser(userId)
      .agents.list();
    expect(new Headers(calls[0].init?.headers).get("X-BA-User-Id")).toBe(
      userId
    );
  });
});
