import type {
  GuidanceFact,
  GuidanceSystem,
  ProductGuidance,
} from "@barrelsgd/api-client";
import type { ProductValues } from "@barrelsgd/gms/products";

export function mergePrefillValues(
  existing: ProductValues,
  proposed: Record<string, string>,
  replace: string[]
): ProductValues {
  const result = { ...existing };
  for (const [key, value] of Object.entries(proposed))
    if (!result[key] || replace.includes(key)) result[key] = value;
  return result;
}

function mergeFacts(existing: GuidanceFact[], proposed: GuidanceFact[]) {
  const facts = new Map<string, GuidanceFact>();
  for (const fact of [...existing, ...proposed]) {
    const key = JSON.stringify([
      fact.key,
      fact.horizon_hours ?? null,
      fact.source_edition_id ?? null,
      fact.source_text ?? "",
    ]);
    if (!facts.has(key)) facts.set(key, fact);
  }
  return [...facts.values()];
}

export function mergeGuidancePrefill(
  current: ProductGuidance,
  proposed: ProductGuidance,
  catalogue: GuidanceSystem[],
  links: Record<string, string>,
  confirmed: string[]
): ProductGuidance {
  const remap = (id: string) =>
    confirmed.includes(id) && links[id] ? links[id] : id;
  const systems = new Map(
    (current.systems ?? []).map((system) => [system.id, system])
  );
  for (const source of proposed.systems ?? []) {
    const id = remap(source.id);
    const saved = systems.get(id);
    const identity = catalogue.find((system) => system.id === id);
    const existing =
      saved ??
      (identity
        ? {
            ...identity,
            facts: [],
            parent_system_id: null,
            suggested_parent_system_id: null,
            relationship_confirmed: false,
          }
        : undefined);
    const suggestedParent = source.suggested_parent_system_id;
    const system: GuidanceSystem = {
      ...source,
      ...existing,
      id,
      narrative: existing?.narrative || source.narrative,
      suggested_parent_system_id: suggestedParent
        ? remap(suggestedParent)
        : existing?.suggested_parent_system_id,
      facts: mergeFacts(existing?.facts ?? [], source.facts ?? []),
    };
    systems.set(id, system);
  }
  return {
    ...current,
    sources: [
      ...new Map(
        [...(current.sources ?? []), ...(proposed.sources ?? [])].map(
          (source) => [source.edition_id, source]
        )
      ).values(),
    ],
    systems: [...systems.values()],
    facts: mergeFacts(current.facts ?? [], proposed.facts ?? []),
  };
}
