import { bothUnits, type Measure as MeasureValue } from "@/lib/units";

/**
 * A measurement in both unit systems. The page carries both; `globals.css`
 * shows the one the visitor chose (metric until they pick), so there is no
 * wrong-units flash and the page stays static. The hidden one is not read out
 * or copied. A measure with no figure renders nothing; callers show a dash.
 */
export function Measure({ measure }: { measure: MeasureValue }) {
  const text = bothUnits(measure);
  if (!text) return null;
  return (
    <>
      <span data-units-only="imperial">{text.imperial}</span>
      <span data-units-only="metric">{text.metric}</span>
    </>
  );
}

/**
 * A whole-degree temperature such as "31°": the figure with a bare degree sign,
 * and the unit named for screen readers only ("Fahrenheit" or "Celsius").
 * Null shows a dash.
 */
export function Temperature({ value }: { value: number | null }) {
  if (value === null) return <>—</>;
  return (
    <>
      <Measure
        measure={{ bare: true, low: value, places: 0, quantity: "temperature" }}
      />
      <span className="sr-only" data-units-only="imperial">
        {" "}
        Fahrenheit
      </span>
      <span className="sr-only" data-units-only="metric">
        {" "}
        Celsius
      </span>
    </>
  );
}
