import { describe, expect, it } from "vitest";
import { iso } from "../test/fixtures/tasks.ts";
import {
  taskCronConfigSchema,
  taskIntervalConfigSchema,
  taskOnceConfigSchema,
} from "./tasks.ts";

describe("schedule config schemas", () => {
  it("accepts each schedule config shape", () => {
    expect(taskOnceConfigSchema.parse({ at: iso })).toStrictEqual({ at: iso });
    expect(taskIntervalConfigSchema.parse({ everyMs: 60_000 })).toStrictEqual({
      everyMs: 60_000,
    });
    expect(
      taskCronConfigSchema.parse({ expression: "0 9 * * 1-5", timezone: "UTC" })
    ).toStrictEqual({ expression: "0 9 * * 1-5", timezone: "UTC" });
  });

  it("defaults cron timezone to UTC", () => {
    expect(
      taskCronConfigSchema.parse({ expression: "0 9 * * *" })
    ).toStrictEqual({ expression: "0 9 * * *", timezone: "UTC" });
  });

  it("rejects intervals under 60s", () => {
    expect(
      taskIntervalConfigSchema.safeParse({ everyMs: 59_999 }).success
    ).toBe(false);
  });

  it("accepts canonical IANA timezones", () => {
    for (const tz of [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Kolkata",
      "Pacific/Auckland",
      // Zones with hyphens/digits/signs in location segments — the regex
      // must not reject these valid canonical IANA zones.
      "America/Port-au-Prince",
      "Asia/Ust-Nera",
      "Etc/GMT+8",
      "Etc/GMT-5",
      "America/Argentina/Buenos_Aires",
    ]) {
      expect(
        taskCronConfigSchema.safeParse({
          expression: "0 9 * * *",
          timezone: tz,
        }).success
      ).toBe(true);
    }
  });

  it("rejects legacy timezone abbreviations and unknown zones", () => {
    for (const tz of ["GMT", "PST", "foo/bar", "not-a-tz", ""]) {
      expect(
        taskCronConfigSchema.safeParse({
          expression: "0 9 * * *",
          timezone: tz,
        }).success
      ).toBe(false);
    }
  });

  it("rejects non-five-field cron expressions", () => {
    for (const expr of [
      "0 9 * *", // four fields
      "* 0 9 * * *", // six fields
      "0 0 L * *", // Quartz-style L
      "0 9 * * mon", // named day
      "bad expr",
      "",
      "0 9 * * * extra",
    ]) {
      expect(
        taskCronConfigSchema.safeParse({
          expression: expr,
          timezone: "UTC",
        }).success
      ).toBe(false);
    }
  });

  it("accepts standard five-field cron expressions", () => {
    for (const expr of [
      "0 9 * * *",
      "*/5 * * * *",
      "0,15,30,45 * * * *",
      "0 9 1-5 * 1-5",
      "0 0 */2 * *",
      "0 0 1-10/2 * *",
    ]) {
      expect(
        taskCronConfigSchema.safeParse({
          expression: expr,
          timezone: "UTC",
        }).success
      ).toBe(true);
    }
  });

  it("rejects out-of-range numeric values per field", () => {
    for (const expr of [
      "60 9 * * *", // minute 60
      "0 24 * * *", // hour 24
      "0 9 32 * *", // day-of-month 32
      "0 9 * 13 *", // month 13
      "99 99 * * *", // both minute and hour out of range
      "0 9 0 * *", // day-of-month 0
      "0 9 * 0 *", // month 0
    ]) {
      expect(
        taskCronConfigSchema.safeParse({
          expression: expr,
          timezone: "UTC",
        }).success
      ).toBe(false);
    }
  });

  it("rejects an expression that never fires (nonexistent date)", () => {
    expect(
      taskCronConfigSchema.safeParse({
        expression: "0 0 31 2 *",
        timezone: "UTC",
      }).success
    ).toBe(false);
  });

  it("accepts Croner's Sunday alias", () => {
    expect(
      taskCronConfigSchema.safeParse({
        expression: "0 9 * * 7",
        timezone: "UTC",
      }).success
    ).toBe(true);
  });

  it("rejects inverted ranges and invalid steps", () => {
    for (const expr of [
      "10-5 * * * *", // inverted range (lo > hi)
      "0 9 * * 5-3", // inverted range in dow
      "*/0 * * * *", // step 0
      "0 9 1-10/0 * *", // step 0 in range/step
    ]) {
      expect(
        taskCronConfigSchema.safeParse({
          expression: expr,
          timezone: "UTC",
        }).success
      ).toBe(false);
    }
  });

  it("accepts an optional staggerMs on cron config", () => {
    expect(
      taskCronConfigSchema.parse({
        expression: "0 9 * * *",
        staggerMs: 60_000,
        timezone: "UTC",
      })
    ).toStrictEqual({
      expression: "0 9 * * *",
      staggerMs: 60_000,
      timezone: "UTC",
    });
  });

  it("rejects a negative staggerMs", () => {
    expect(
      taskCronConfigSchema.safeParse({
        expression: "0 9 * * *",
        staggerMs: -1,
        timezone: "UTC",
      }).success
    ).toBe(false);
  });

  it("rejects a non-integer staggerMs", () => {
    expect(
      taskCronConfigSchema.safeParse({
        expression: "0 9 * * *",
        staggerMs: 1.5,
        timezone: "UTC",
      }).success
    ).toBe(false);
  });
});
