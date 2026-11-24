// The booking policy a business writes in studio Settings: plain text, at most
// 1000 characters, with its line breaks kept. The API stores it the same way
// (`normalise_policy`), so the count here matches the one the API enforces.

export const BOOKING_POLICY_MAX = 1000;

/** The policy as the API takes it: line endings as \n, trimmed; blank is null. */
export function cleanPolicy(text: string): string | null {
  const normalised = text.replace(/\r\n?/gu, "\n").trim();
  return normalised === "" ? null : normalised;
}

/** Characters as people count them: one code point is one character. */
export function policyLength(text: string): number {
  return [...text].length;
}
