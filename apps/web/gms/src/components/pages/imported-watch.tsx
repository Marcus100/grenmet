import { importedWatch } from "@/lib/weather-pages";

/**
 * The alerts and warnings in force when a Marine Forecast was issued, copied
 * into the issue by FastAPI (the same snapshot the land forecasts use for
 * "What to watch"). Nothing renders for an issue that predates the snapshot or
 * has nothing in force.
 */
export function ImportedWatch({ advisories }: { advisories?: string }) {
  const lines = importedWatch(advisories) ?? [];
  if (lines.length === 0) return null;
  return (
    <section aria-label="What to watch" className="space-y-1">
      <h3 className="text-gm-heading font-bold">What to watch</h3>
      <ul className="text-body-base text-gm-text-secondary leading-body-base list-disc space-y-1 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
