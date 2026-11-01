import type { CapCategory, GmsCataloguePublic } from "@barrelsgd/api-client";

/**
 * Authoring suggestions, not approved thresholds, official event codes or
 * issuing authority. The hazard list and category labels are served by the API
 * (GET /api/v1/cap/gms-catalogue, from apps/api/fastapi/src/cap/catalogue.py).
 */
export type CapHazardGroup = GmsCataloguePublic["hazard_groups"][number];

export function categoryKeys(catalogue: GmsCataloguePublic): CapCategory[] {
  return catalogue.category_labels.map((item) => item.key);
}

export function categoryLabel(
  catalogue: GmsCataloguePublic,
  category: CapCategory
): string {
  return (
    catalogue.category_labels.find((item) => item.key === category)?.label ??
    category
  );
}

export function suggestedCategories(
  catalogue: GmsCataloguePublic,
  event: string
): CapCategory[] {
  const normalized = event.trim().toLocaleLowerCase("en");
  const group = catalogue.hazard_groups.find((candidate) =>
    candidate.events.some((name) => name.toLocaleLowerCase("en") === normalized)
  );
  return group ? [...group.categories] : [];
}
