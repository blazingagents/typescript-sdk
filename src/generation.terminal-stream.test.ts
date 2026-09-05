import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTerminalStreamResult } from "./generation.ts";

const bytes = new TextEncoder().encode("data: [DONE]\n\n");

function result() {
  return buildTerminalStreamResult(
    new Response(bytes, { headers: { "x-request-id": "stream-test" } }),
    "chat"
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("terminal stream access", () => {
  it("reads untouched bytes without calling the global Response constructor", async () => {
    const terminal = result();
    const responseConstructor = vi.fn(() => {
      throw new Error("Response does not support streaming bodies");
    });
    vi.stubGlobal("Response", responseConstructor);
    const reader = terminal.toStream().getReader();
    await expect(reader.read()).resolves.toEqual({ done: false, value: bytes });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(responseConstructor).not.toHaveBeenCalled();
  });

  it.each([
    ["toStream", "toStream"],
    ["toStream", "toResponse"],
    ["toResponse", "toStream"],
  ] as const)("shares ownership between %s and %s", (first, second) => {
    const terminal = result();
    terminal[first]();
    expect(() => terminal[second]()).toThrowError(
      expect.objectContaining({
        code: "stream_error",
        message: "The chat response body has already been claimed.",
        requestId: "stream-test",
      })
    );
  });

  it("preserves normalized read failures and request identity", async () => {
    const terminal = buildTerminalStreamResult(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new Error("socket closed"));
          },
        }),
        { headers: { "x-request-id": "stream-test" } }
      ),
      "chat"
    );
    await expect(terminal.toStream().getReader().read()).rejects.toMatchObject({
      code: "stream_error",
      message: "socket closed",
      requestId: "stream-test",
    });
  });

  it("forwards cancellation to the original body", async () => {
    const cancel = vi.fn();
    const terminal = buildTerminalStreamResult(
      new Response(new ReadableStream<Uint8Array>({ cancel })),
      "chat"
    );
    await terminal.toStream().cancel("screen closed");
    expect(cancel).toHaveBeenCalledWith("screen closed");
  });
});
