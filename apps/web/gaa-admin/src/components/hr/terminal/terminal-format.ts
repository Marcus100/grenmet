import {
  clockPunchKind,
  hrGetAttendanceReviewQueryKey,
  hrGetAttendanceWeekQueryKey,
  type TerminalAttentionOutcome,
  type TerminalOutcomeCounts,
  type TerminalPunchOutcome,
  type TerminalPunchPublic,
  terminalAttentionOutcome,
} from "@barrelsgd/api-client";
import type { QueryClient } from "@tanstack/react-query";

/** Plain-language name for each outcome the import can decide (ADR-0040). */
export const OUTCOME_LABELS: Record<TerminalPunchOutcome, string> = {
  PENDING: "Not decided",
  UNMAPPED: "Unknown device ID",
  NO_SHIFT: "No matching shift",
  REFUSED: "Refused",
  RECORDED: "Recorded",
  ALREADY_RECORDED: "Already recorded",
  REPEAT: "Repeat scan",
};

/** What HR should do about each outcome that needs attention. */
export const ATTENTION_HELP: Record<TerminalAttentionOutcome, string> = {
  UNMAPPED:
    "The terminal user ID is not linked to anyone in this department. Link it under Terminal users, then decide held punches again.",
  NO_SHIFT:
    "The person had no rostered shift near this time. Fix the roster if they worked, then decide held punches again.",
  REFUSED:
    "The person who imported or decided this punch cannot record attendance for this employee. Someone who can record attendance on their behalf should press Decide again.",
};

export const ATTENTION_OUTCOMES = Object.values(terminalAttentionOutcome);

export function isAttentionOutcome(
  value: string | null
): value is TerminalAttentionOutcome {
  return ATTENTION_OUTCOMES.includes(value as TerminalAttentionOutcome);
}

const COUNT_LINES: [keyof TerminalOutcomeCounts, string][] = [
  ["recorded", "recorded"],
  ["already_recorded", "already recorded"],
  ["repeat", "repeat scans ignored"],
  ["no_shift", "with no matching shift"],
  ["unmapped", "with an unknown device ID"],
  ["refused", "refused"],
];

/** "3 recorded, 1 with an unknown device ID"; outcomes with zero are left out. */
export function countsSummary(counts: TerminalOutcomeCounts): string {
  const parts = COUNT_LINES.filter(([key]) => (counts[key] ?? 0) > 0).map(
    ([key, label]) => `${counts[key]} ${label}`
  );
  return parts.length > 0 ? parts.join(", ") : "nothing to decide";
}

export function attentionTotal(counts: TerminalOutcomeCounts): number {
  return (
    (counts.no_shift ?? 0) + (counts.unmapped ?? 0) + (counts.refused ?? 0)
  );
}

export function punchTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Grenada",
  });
}

export function kindLabel(punch: TerminalPunchPublic): string {
  if (punch.kind === clockPunchKind.ARRIVE) return "Arrival";
  if (punch.kind === clockPunchKind.DEPART) return "Departure";
  return "—";
}

export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error)
    return typeof error.status === "number" ? error.status : undefined;
  return undefined;
}

/** Everything a terminal import, reprocess or mapping change can move. */
export function invalidateAfterTerminalChange(
  queryClient: QueryClient
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: [{ url: "/api/v1/hr/attendance/terminal-punches" }],
    }),
    queryClient.invalidateQueries({
      queryKey: [{ url: "/api/v1/hr/attendance/terminal-users" }],
    }),
    queryClient.invalidateQueries({
      queryKey: [hrGetAttendanceReviewQueryKey()[0]],
    }),
    queryClient.invalidateQueries({
      queryKey: [hrGetAttendanceWeekQueryKey({ query: { day: "" } })[0]],
    }),
  ]).then(() => undefined);
}
