import type { Metadata } from "next";
import { formatFrequency } from "@/db/janitorial/parse-spec";
import { getJanitorialSpec } from "@/db/janitorial/queries";

export const metadata: Metadata = {
  title: "Janitorial",
  description:
    "GAA airport janitorial cleaning specification — areas, activities, and frequencies.",
};

export const dynamic = "force-dynamic";

export default async function JanitorPage() {
  const buildings = await getJanitorialSpec();
  const totalAreas = buildings.reduce(
    (count, building) =>
      count +
      building.sections.reduce((sum, section) => sum + section.areas.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Janitorial Cleaning Spec
        </h1>
        <p className="text-muted-foreground text-sm">
          GAA Air Terminal — areas, activities, and cleaning frequencies.{" "}
          {buildings.length} buildings · {totalAreas} areas.
        </p>
      </div>

      {buildings.map((building) => (
        <section className="space-y-4" key={building.id}>
          <h2 className="font-semibold text-lg tracking-tight">
            {building.name}
          </h2>
          {building.sections.map((group) => (
            <div className="space-y-2" key={`sec-${group.id ?? "none"}`}>
              {group.name ? (
                <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group.name}
                </h3>
              ) : null}
              <div className="grid gap-2">
                {group.areas.map((area) => (
                  <details
                    className="rounded-lg border border-border bg-card"
                    key={area.id}
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 font-medium text-sm">
                      <span>{area.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {area.tasks.length} tasks
                        {area.bundles.length > 0 ? " + terrazzo" : ""}
                      </span>
                    </summary>
                    <ul className="divide-y divide-border border-border border-t">
                      {area.tasks.map((task) => (
                        <li
                          className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                          key={task.id}
                        >
                          <span className="flex items-center gap-2">
                            {task.activity}
                            {task.mode ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                                {task.mode}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-mono text-muted-foreground text-xs">
                            {formatFrequency(task.frequency)}
                          </span>
                        </li>
                      ))}
                      {area.bundles.map((bundle) => (
                        <li className="px-4 py-2" key={`bundle-${bundle.id}`}>
                          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                            {bundle.name}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {bundle.items.map((item) => (
                              <li
                                className="flex items-center justify-between gap-3 text-sm"
                                key={`${bundle.id}-${item.activity}`}
                              >
                                <span className="text-muted-foreground">
                                  {item.activity}
                                </span>
                                <span className="shrink-0 font-mono text-muted-foreground text-xs">
                                  {formatFrequency(item.frequency)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
