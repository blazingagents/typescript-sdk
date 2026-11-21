import { z } from "zod";

export const atLeastOneFieldMessage = "At least one field must be provided.";

/**
 * Checks whether the object has at least one own enumerable key.
 * @param value - Value to inspect.
 * @returns Whether at least one own enumerable key exists.
 */
export function hasObjectKeys(value: object) {
  return Object.keys(value).length > 0;
}

/**
 * Checks whether every string in the array is unique.
 * @param values - Values to inspect or substitute.
 * @returns Whether no string occurs more than once.
 */
export function hasUniqueValues(values: string[]) {
  return new Set(values).size === values.length;
}

/**
 * A `YYYY-MM-DD` date that PostgreSQL's `date` holds. `z.iso.date()` accepts
 * `0000-01-01`, but PostgreSQL has no year 0 and refuses the cast, so a route
 * that passes the date on would answer 500 instead of `validation_failed`.
 */
export const calendarDateSchema = z.iso
  .date()
  .refine((date) => !date.startsWith("0000-"), {
    message: "Year 0000 does not exist.",
  });

const OFFSET_PATTERN = /[+-](\d{2})(?::?\d{2})?$/;
/** PostgreSQL refuses a UTC offset of 16 hours or more. */
const MAX_OFFSET_HOURS = 15;

/**
 * An ISO 8601 instant with an offset that PostgreSQL's `timestamptz` holds.
 * `z.iso.datetime()` accepts what PostgreSQL refuses: year `0000`, an offset
 * that moves `0001-01-01T00:00:00+05:00` to UTC year 0 (`toISOString()` prints
 * `0000-12-31T19:00:00.000Z`), and an offset of 16 hours or more, such as
 * `+23:59`. A route that passes the instant on would answer 500 instead of
 * `validation_failed`.
 */
export const instantSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (instant) =>
      !instant.startsWith("0000-") &&
      new Date(instant).getUTCFullYear() >= 1 &&
      Number(OFFSET_PATTERN.exec(instant)?.[1] ?? 0) <= MAX_OFFSET_HOURS,
    { message: "Not an instant PostgreSQL's timestamptz holds." }
  );
