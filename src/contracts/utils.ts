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
