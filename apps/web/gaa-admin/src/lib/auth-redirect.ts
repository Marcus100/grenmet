export { getRequestOrigin, getSafeLocalReturnTo } from "@barrelsgd/auth/server";

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function readQueryParam(
  value: string | string[] | undefined
): string | null {
  const first = firstValue(value);
  return first ? first.trim() : null;
}
