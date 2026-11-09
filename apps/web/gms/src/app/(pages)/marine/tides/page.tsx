import { Measure } from "@/components/measure";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import {
  dayRange,
  fetchPublicTides,
  grenadaDay,
  TIDE_DAYS,
  type TidesResult,
} from "@/lib/almanac";
import { localDay, localTime, localWeekday } from "@/lib/current-conditions";

export const metadata = {
  title: "Tide information",
  description:
    "Predicted high and low tides for Prickly Bay, Grenada, for the next seven days. Provisional, not for navigation.",
};

/** Headings and the Grenada date of one day, from its `YYYY-MM-DD`. */
function dayHeading(day: string) {
  const noon = `${day}T12:00:00-04:00`;
  return `${localWeekday(noon)} ${localDay(noon)}`;
}

/**
 * The predicted tides, day by day. An unreadable table says so; a readable one
 * with no events in the window says there are no predictions. Never a blank.
 */
function TideTables({ days, result }: { days: string[]; result: TidesResult }) {
  if (result.status === "unavailable")
    return (
      <p className="text-gm-heading font-semibold" role="status">
        Tide predictions cannot be retrieved right now. Check again later.
      </p>
    );
  const { events } = result.tides;
  const byDay = days.map((day) => ({
    day,
    events: events.filter((event) => event.time_local.startsWith(day)),
  }));
  if (byDay.every((entry) => entry.events.length === 0))
    return (
      <p className="text-gm-text-secondary">
        No predictions available for these dates.
      </p>
    );
  return (
    <div className="grid gap-6">
      {byDay
        .filter((entry) => entry.events.length > 0)
        .map(({ day, events: dayEvents }) => (
          <section key={day}>
            <h3 className="text-gm-heading mb-2 font-semibold">
              {dayHeading(day)}
            </h3>
            <table className="text-body w-full max-w-md border-collapse text-left">
              <caption className="sr-only">
                Predicted high and low tides for Prickly Bay on{" "}
                {dayHeading(day)}
              </caption>
              <thead>
                <tr className="text-gm-text-secondary border-b">
                  <th className="py-1.5 font-semibold" scope="col">
                    Tide
                  </th>
                  <th className="py-1.5 font-semibold" scope="col">
                    Time (Grenada)
                  </th>
                  <th className="py-1.5 font-semibold" scope="col">
                    Height
                  </th>
                </tr>
              </thead>
              <tbody>
                {dayEvents.map((event) => (
                  <tr className="border-b" key={event.time_utc}>
                    <td className="py-1.5">
                      {event.event_type === "HIGH" ? "High" : "Low"}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {localTime(event.time_local)}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      <Measure
                        measure={{
                          low: event.height_m_mllw,
                          places: 1,
                          quantity: "height",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
    </div>
  );
}

export default async function TidesPage() {
  const first = grenadaDay();
  const days = dayRange(first, TIDE_DAYS);
  const result = await fetchPublicTides(first, days.at(-1) ?? first);
  return (
    <>
      <PageHeader
        description="Predicted high and low water at Prickly Bay for the next seven days."
        title="Tide information"
      />
      <PageSection heading="Next seven days">
        <p className="text-gm-heading mb-3 font-semibold" role="note">
          Predicted tides for Prickly Bay. Provisional, not for navigation.
        </p>
        {result.status === "ok" ? (
          <p className="text-gm-text-secondary text-body-sm leading-body-sm mb-4">
            <span className="font-semibold">Source:</span>{" "}
            {result.tides.source_label ?? "Prickly Bay tide table"}
            {" · "}
            <span className="font-semibold">Status:</span> Provisional, not yet
            quality checked · Times in Grenada time (UTC−04:00)
          </p>
        ) : null}
        <TideTables days={days} result={result} />
      </PageSection>
      <PageSection heading="Tides around Grenada">
        <Prose
          paragraphs={[
            "Grenada has a small tidal range — typically well under a metre between high and low water. Tide alone rarely causes flooding here.",
            "The risk comes from combination: a high spring tide arriving alongside storm surge and heavy rainfall can push water into low-lying parts of St. George's that any one of those alone would not reach.",
          ]}
        />
      </PageSection>
    </>
  );
}
