import type { CapAlertPublic, CapLifecycleState } from "@barrelsgd/api-client";

export interface BoardSection {
  alerts: CapAlertPublic[];
  empty: string;
  state: CapLifecycleState;
  title: string;
}

/** The chip for "show every stage". */
export const ALL_STATES = "ALL" as const;
export type BoardFilter = CapLifecycleState | typeof ALL_STATES;

/** Matches the headline or the identifier, ignoring case and surrounding spaces. */
export function matchesSearch(alert: CapAlertPublic, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const headline = alert.info?.[0]?.headline ?? "";
  return (
    headline.toLowerCase().includes(needle) ||
    alert.identifier.toLowerCase().includes(needle)
  );
}

/**
 * The sections to show for a chip. "All" keeps every stage, including empty
 * ones. A chip only narrows to its own stage; it never hides an empty stage
 * by itself, and the search narrows rows but keeps each stage's heading.
 */
export function visibleSections(
  sections: readonly BoardSection[],
  filter: BoardFilter,
  query: string
): BoardSection[] {
  return sections
    .filter((section) => filter === ALL_STATES || section.state === filter)
    .map((section) => ({
      ...section,
      alerts: section.alerts.filter((alert) => matchesSearch(alert, query)),
    }));
}
