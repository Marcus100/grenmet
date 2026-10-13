const NAME_SEPARATORS = /[\s.-]+/;

/** "Marcus Whint" -> "MW": the observer initials keyed in paper column 65. */
export function observerInitials(name: string | null | undefined): string {
  const words = (name ?? "").split(NAME_SEPARATORS).filter(Boolean);
  return words
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
