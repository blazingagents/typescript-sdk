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
