import type { MonthStat } from "@/lib/month-summary";
import { measureParts, UNIT_SYSTEMS, type UnitSystem } from "@/lib/units";

const UNIT_CLASS =
  "ml-1 font-sans font-semibold text-body-sm text-gm-text-secondary leading-body-sm lg:text-body-base lg:leading-body-base";

function Figure({ figure, unit }: { figure: string; unit: string }) {
  return (
    <>
      {figure}
      <span className={UNIT_CLASS}>{unit}</span>
    </>
  );
}

/**
 * A card's big number and its unit. Measurements carry both unit systems and
 * CSS shows the visitor's (`components/measure.tsx`); counts, like rain days,
 * are plain text.
 */
export function StatFigure({ stat }: { stat: MonthStat }) {
  if (stat.value === null) return <>—</>;
  const { measure } = stat;
  if (!measure) return <Figure figure={stat.value} unit={stat.unit} />;
  return (
    <>
      {UNIT_SYSTEMS.map((system: UnitSystem) => {
        const parts = measureParts(measure.quantity, measure.value, system);
        return parts ? (
          <span data-units-only={system} key={system}>
            <Figure {...parts} />
          </span>
        ) : null;
      })}
    </>
  );
}
