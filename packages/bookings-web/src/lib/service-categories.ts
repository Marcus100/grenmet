// Grouping the public service list by category. React-free so it can be
// unit-tested without a DOM.

import type { BookingPublicService } from "@barrelsgd/api-client";

/** The heading for services that have no category (and the flat list's heading). */
export const UNCATEGORISED_LABEL = "Services";

export interface ServiceCategory {
  /** Stable key: the category folded to lower case, "" for uncategorised. */
  key: string;
  /** The category as the business typed it first; `UNCATEGORISED_LABEL` for none. */
  label: string;
  services: BookingPublicService[];
}

function categoryKey(service: BookingPublicService): string {
  return (service.category ?? "").trim().toLowerCase();
}

/**
 * Groups services in the order their category first appears in the list (the
 * business's configured order). Categories that differ only by case or spaces
 * are one group. A service with no category goes in the "Services" group.
 */
export function groupServicesByCategory(
  services: BookingPublicService[]
): ServiceCategory[] {
  const groups = new Map<string, ServiceCategory>();
  for (const service of services) {
    const key = categoryKey(service);
    const existing = groups.get(key);
    if (existing) {
      existing.services.push(service);
    } else {
      const label = (service.category ?? "").trim() || UNCATEGORISED_LABEL;
      groups.set(key, { key, label, services: [service] });
    }
  }
  return [...groups.values()];
}

/**
 * The one category open when the page loads: the one holding the chosen
 * service, else the one holding the first "Book again" shortcut, else the
 * first category. Null when there are no categories.
 */
export function defaultOpenCategory(
  groups: ServiceCategory[],
  selectedId: string | null,
  bookAgainIds: string[] = []
): string | null {
  const holding = (id: string) =>
    groups.find((group) => group.services.some((s) => s.id === id))?.key ??
    null;
  if (selectedId) {
    const found = holding(selectedId);
    if (found !== null) {
      return found;
    }
  }
  for (const id of bookAgainIds) {
    const found = holding(id);
    if (found !== null) {
      return found;
    }
  }
  return groups[0]?.key ?? null;
}

/** "1 service" or "3 services". */
export function serviceCountLabel(count: number): string {
  return count === 1 ? "1 service" : `${count} services`;
}
