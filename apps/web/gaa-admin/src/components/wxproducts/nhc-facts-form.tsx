"use client";

import type { GuidanceFact, GuidanceSource } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";

const SYSTEM_FIELDS: GuidanceFact["key"][] = [
  "latitude",
  "longitude",
  "axis_longitude",
  "axis_northern_limit",
  "relative_location",
  "pressure",
  "movement_direction",
  "movement_speed",
  "maximum_wind",
  "gust",
  "convection_coverage",
  "convection_intensity",
  "convection_location",
  "organization",
  "latitude_min",
  "latitude_max",
  "longitude_west",
  "longitude_east",
  "environment",
  "limiting_factor",
  "development_window",
  "hazard",
  "affected_area",
  "duration",
  "rainfall",
  "flooding",
];
const UNITS: Partial<Record<GuidanceFact["key"], string>> = {
  latitude: "degrees_north",
  longitude: "degrees_east",
  axis_longitude: "degrees_east",
  axis_northern_limit: "degrees_north",
  pressure: "hPa",
  movement_speed: "kt",
  maximum_wind: "kt",
  gust: "kt",
  latitude_min: "degrees_north",
  latitude_max: "degrees_north",
  longitude_west: "degrees_east",
  longitude_east: "degrees_east",
  formation_probability: "percent",
  wave_height: "m",
  swell_height: "m",
  swell_period: "s",
  visibility: "km",
};

export function FactsForm({
  facts,
  onChange,
  full = false,
  sources,
}: {
  facts: GuidanceFact[];
  onChange: (facts: GuidanceFact[]) => void;
  full?: boolean;
  sources: GuidanceSource[];
}) {
  const defaults: GuidanceFact[] = [
    ...SYSTEM_FIELDS.map(
      (key): GuidanceFact => ({
        key,
        record_type: "analysis",
        unit: UNITS[key] ?? null,
      })
    ),
    ...[48, 168].map(
      (horizon): GuidanceFact => ({
        key: "formation_probability",
        record_type: "forecast",
        unit: "percent",
        horizon_hours: horizon,
      })
    ),
  ];
  const used = new Set<GuidanceFact>();
  const rows = full
    ? defaults
        .map((blank) => {
          const fact = facts.find(
            (item) =>
              item.key === blank.key &&
              (item.horizon_hours ?? null) === (blank.horizon_hours ?? null)
          );
          if (fact) used.add(fact);
          return fact ?? blank;
        })
        .concat(facts.filter((fact) => !used.has(fact)))
    : facts;
  function update(index: number, change: Partial<GuidanceFact>) {
    const next = [...facts];
    const row = rows[index];
    if (!row) return;
    const current = facts.indexOf(row);
    if (current >= 0) next[current] = { ...row, ...change };
    else next.push({ ...row, id: crypto.randomUUID(), ...change });
    onChange(next);
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left">
            Numbers, ranges and wording remain separate. Leave unknown
            measurements blank.
          </caption>
          <thead>
            <tr>
              {[
                "Field",
                "Record type",
                "Value",
                "Minimum",
                "Maximum",
                "Unit",
                "Description",
                "Qualifier",
                "Evidence",
                "Reference / validity (UTC)",
              ].map((name) => (
                <th className="p-2 text-left" key={name}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((fact, index) => (
              <tr
                className="border-t"
                key={
                  index < defaults.length && full
                    ? `${fact.key}-${fact.horizon_hours ?? ""}`
                    : (fact.id ?? `${fact.key}-${fact.horizon_hours ?? ""}`)
                }
              >
                <th className="p-2 text-left font-medium">
                  {fact.key.replaceAll("_", " ")}
                  {fact.horizon_hours ? ` (${fact.horizon_hours} h)` : ""}
                </th>
                <td className="p-2">
                  <select
                    aria-label={`${fact.key} record type ${index}`}
                    className="bg-background rounded-md border p-2"
                    onChange={(event) =>
                      update(index, {
                        record_type: event.target
                          .value as GuidanceFact["record_type"],
                      })
                    }
                    value={fact.record_type}
                  >
                    <option value="observation">Observation</option>
                    <option value="analysis">Analysis</option>
                    <option value="forecast">Forecast</option>
                  </select>
                </td>
                {(["value", "minimum", "maximum"] as const).map((key) => (
                  <td className="p-2" key={key}>
                    <Input
                      aria-label={`${fact.key} ${key} ${index}`}
                      className="w-24"
                      onChange={(event) =>
                        update(index, {
                          [key]:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                      step="any"
                      type="number"
                      value={fact[key] ?? ""}
                    />
                  </td>
                ))}
                <td className="p-2">
                  <Input
                    aria-label={`${fact.key} unit ${index}`}
                    className="w-32"
                    onChange={(event) =>
                      update(index, { unit: event.target.value || null })
                    }
                    value={fact.unit ?? ""}
                  />
                </td>
                <td className="p-2">
                  <Input
                    aria-label={`${fact.key} description ${index}`}
                    className="w-52"
                    maxLength={2000}
                    onChange={(event) =>
                      update(index, { description: event.target.value })
                    }
                    value={fact.description ?? ""}
                  />
                </td>
                <td className="p-2">
                  <Input
                    aria-label={`${fact.key} qualifier ${index}`}
                    className="w-36"
                    maxLength={200}
                    onChange={(event) =>
                      update(index, { qualifier: event.target.value || null })
                    }
                    value={fact.qualifier ?? ""}
                  />
                </td>
                <td className="p-2">
                  <Textarea
                    aria-label={`${fact.key} source passage ${index}`}
                    className="w-60"
                    maxLength={12_000}
                    onChange={(event) =>
                      update(index, { source_text: event.target.value })
                    }
                    rows={2}
                    value={fact.source_text ?? ""}
                  />
                  <select
                    aria-label={`${fact.key} evidence source ${index}`}
                    className="bg-background rounded-md border p-2"
                    onChange={(event) =>
                      update(index, {
                        source_edition_id: event.target.value || null,
                      })
                    }
                    value={fact.source_edition_id ?? ""}
                  >
                    <option value="">GMS entry</option>
                    {sources.map((source) => (
                      <option key={source.edition_id} value={source.edition_id}>
                        {source.title} · {source.issued_at ?? "Issue unknown"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="space-y-2 p-2">
                  {(["reference_time", "valid_from", "valid_to"] as const).map(
                    (key) => (
                      <Input
                        aria-label={`${fact.key} ${key} UTC ${index}`}
                        className="w-52"
                        key={key}
                        onChange={(event) =>
                          update(index, {
                            [key]: event.target.value
                              ? `${event.target.value}:00Z`
                              : null,
                          })
                        }
                        type="datetime-local"
                        value={fact[key]?.slice(0, 16) ?? ""}
                      />
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {facts
        .filter((fact) => fact.sample)
        .map((fact) => (
          <p className="text-xs" key={fact.id}>
            Native sample evidence: {JSON.stringify(fact.sample)}
          </p>
        ))}
      <Button
        onClick={() =>
          onChange([
            ...facts,
            { id: crypto.randomUUID(), key: "hazard", record_type: "forecast" },
          ])
        }
        type="button"
        variant="outline"
      >
        Add another hazard / phenomenon
      </Button>
    </div>
  );
}
