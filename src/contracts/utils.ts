export const atLeastOneFieldMessage = "At least one field must be provided.";

export function hasObjectKeys(value: object) {
  return Object.keys(value).length > 0;
}

export function hasUniqueValues(values: string[]) {
  return new Set(values).size === values.length;
}
