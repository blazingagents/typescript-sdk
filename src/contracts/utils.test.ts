import { describe, expect, it } from "vitest";

import {
  atLeastOneFieldMessage,
  hasObjectKeys,
  hasUniqueValues,
} from "./utils.ts";

describe("atLeastOneFieldMessage", () => {
  it("is a non-empty human-readable string", () => {
    expect(atLeastOneFieldMessage.length).toBeGreaterThan(0);
  });
});

describe("hasObjectKeys", () => {
  it("returns false for an empty object", () => {
    expect(hasObjectKeys({})).toBe(false);
  });

  it("returns true for an object with one key", () => {
    expect(hasObjectKeys({ a: 1 })).toBe(true);
  });

  it("returns true for an object with many keys", () => {
    expect(hasObjectKeys({ a: 1, b: 2, c: 3 })).toBe(true);
  });
});

describe("hasUniqueValues", () => {
  it("returns true for an empty list", () => {
    expect(hasUniqueValues([])).toBe(true);
  });

  it("returns true for a list with no duplicates", () => {
    expect(hasUniqueValues(["a", "b", "c"])).toBe(true);
  });

  it("returns false when duplicates exist", () => {
    expect(hasUniqueValues(["a", "a"])).toBe(false);
    expect(hasUniqueValues(["a", "b", "a"])).toBe(false);
  });
});
