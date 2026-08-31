import { sessionIdSchema } from "@blazingagents/sdk/contracts";
import { describe, expect, it } from "vitest";

describe("installed SDK contracts", () => {
  it("exports the curated runtime contract entry point", () => {
    expect(sessionIdSchema.parse("ss_0123456789abcdef")).toBe(
      "ss_0123456789abcdef"
    );
  });
});
