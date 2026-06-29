import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WHITESPACE_RE = /\s+/;

/** Derive initials from a name, falling back to "?". */
export function getInitials(str: string): string {
  if (typeof str !== "string" || !str.trim()) {
    return "?";
  }

  return (
    str
      .trim()
      .split(WHITESPACE_RE)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
}
