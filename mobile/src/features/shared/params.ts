/** The first value of a route parameter (useLocalSearchParams returns an array for a repeated one). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
