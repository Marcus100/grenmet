import type { CapStatisticsBucket } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata, Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DeskForbidden,
  DeskRefused,
  DeskUnavailable,
} from "@/components/desk/desk-panels";
import { getStatistics } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import {
  isCalendarDay,
  parseStatisticsQuery,
  rawStatisticsFilter,
  type StatisticsFilter,
  statisticsQueryString,
} from "@/lib/desk/statistics-query";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Statistics" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * How many warnings GMS published, by hazard, colour, parish and month. Read
 * on the server with the forecaster's token; the filters come from validated
 * search parameters. Every colour, parish and month is listed, with zero when
 * it has none (nothing is hidden for being empty).
 */
export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireDeskGate("/desk/statistics");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.read) {
    return (
      <DeskForbidden
        permission="cap.alert.read"
        what="the warning statistics"
      />
    );
  }
  const params = await searchParams;
  const query = parseStatisticsQuery(params);
  if (!query.ok) {
    // Keep what was typed so the form can be corrected, not reset.
    return (
      <StatisticsShell
        downloadable={false}
        filter={rawStatisticsFilter(params)}
      >
        <Problems messages={query.problems} />
      </StatisticsShell>
    );
  }
  const requested: StatisticsFilter = {
    end: query.end,
    hazard: query.hazard,
    start: query.start,
  };
  let statistics: Awaited<ReturnType<typeof getStatistics>>;
  try {
    statistics = await getStatistics(gate.accessToken, requested);
  } catch (error) {
    // A period the API refuses (422) is the user's to change, not a fault.
    if (isAuthApiError(error) && error.status === 422) {
      return (
        <StatisticsShell downloadable={false} filter={requested}>
          <Problems messages={[error.message]} />
        </StatisticsShell>
      );
    }
    reportError(error, "cap-desk-statistics-page");
    return (
      <StatisticsShell downloadable={false} filter={requested}>
        <DeskUnavailable what="The warning statistics" />
      </StatisticsShell>
    );
  }
  // The API fills in a missing period; show and export the period it used.
  const used: StatisticsFilter = {
    end: statistics.end,
    hazard: statistics.hazard ?? null,
    start: statistics.start,
  };
  return (
    <StatisticsShell downloadable filter={used}>
      <p className="text-body-sm" role="status">
        <strong>{statistics.total}</strong>{" "}
        {statistics.total === 1 ? "warning" : "warnings"} published from{" "}
        {statistics.start} to {statistics.end}
        {statistics.hazard ? ` for ${statistics.hazard}` : ""}.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <CountTable
          caption="By hazard"
          empty="No warnings were published in this period."
          hazardLinks={used}
          hint="Choose a hazard to see only its warnings."
          rows={statistics.by_hazard}
        />
        <CountTable
          caption="By colour"
          hint="Green, yellow, orange and red are the GMS impact colours. An Outlook has no colour yet."
          rows={statistics.by_colour}
        />
        <CountTable
          caption="By parish"
          hint="A warning that covers several parishes counts in each of them."
          rows={statistics.by_parish}
        />
        <CountTable caption="By month" rows={statistics.by_month} />
      </div>
    </StatisticsShell>
  );
}

/** The refusal reasons, in the one alert block the page uses for them. */
function Problems({ messages }: { messages: string[] }) {
  return (
    <div className="space-y-2" role="alert">
      {messages.map((message) => (
        <p className="text-destructive" key={message}>
          {message}
        </p>
      ))}
    </div>
  );
}

/** Browsers cannot show a date that is not a real day, so such a value uses a text box. */
function dateInputType(value: string | null): "date" | "text" {
  return !value || isCalendarDay(value) ? "date" : "text";
}

function hazardHref(filter: StatisticsFilter, hazard: string | null): Route {
  return `/desk/statistics${statisticsQueryString({ ...filter, hazard })}` as Route;
}

function CountTable({
  caption,
  empty,
  hazardLinks,
  hint,
  rows,
}: {
  caption: string;
  empty?: string;
  /** When set, each row links to the same view filtered to that hazard. */
  hazardLinks?: StatisticsFilter;
  hint?: string;
  rows: readonly CapStatisticsBucket[];
}) {
  return (
    <section className="bg-card space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">{caption}</h2>
      {hint ? (
        <p className="text-body-sm text-muted-foreground">{hint}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{empty ?? "Nothing to show."}</p>
      ) : (
        <table className="text-body-sm w-full">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-1 font-medium" scope="col">
                {caption.replace("By ", "")}
              </th>
              <th className="py-1 text-right font-medium" scope="col">
                Warnings
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b last:border-b-0" key={row.key}>
                <th className="py-1 text-left font-normal" scope="row">
                  {hazardLinks ? (
                    <Link
                      className="text-info underline"
                      href={hazardHref(hazardLinks, row.key)}
                    >
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </th>
                <td className="py-1 text-right tabular-nums">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * The filter form and CSV link; they keep the period and hazard in view. The
 * CSV link is offered only when the page could load its counts.
 */
function StatisticsShell({
  children,
  downloadable,
  filter,
}: {
  children: ReactNode;
  downloadable: boolean;
  filter: StatisticsFilter;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Warning statistics</h1>
      <p className="text-body-sm text-muted-foreground">
        Published warnings only (expired and cancelled ones included). Updates,
        cancellations, exercises and tests are not counted. Dates are Grenada
        time. Leave the dates empty for the last twelve months.
      </p>
      <form
        action="/desk/statistics"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <label
          className="text-body-sm flex flex-col gap-1"
          htmlFor="statistics-start"
        >
          From
          <input
            className="bg-background rounded-md border px-3 py-2"
            defaultValue={filter.start ?? ""}
            id="statistics-start"
            name="start"
            placeholder="YYYY-MM-DD"
            type={dateInputType(filter.start)}
          />
        </label>
        <label
          className="text-body-sm flex flex-col gap-1"
          htmlFor="statistics-end"
        >
          To
          <input
            className="bg-background rounded-md border px-3 py-2"
            defaultValue={filter.end ?? ""}
            id="statistics-end"
            name="end"
            placeholder="YYYY-MM-DD"
            type={dateInputType(filter.end)}
          />
        </label>
        <label
          className="text-body-sm flex flex-col gap-1"
          htmlFor="statistics-hazard"
        >
          Hazard (exact name, optional)
          <input
            className="bg-background min-w-64 rounded-md border px-3 py-2"
            defaultValue={filter.hazard ?? ""}
            id="statistics-hazard"
            maxLength={255}
            name="hazard"
          />
        </label>
        <button
          className="bg-primary text-body-sm text-primary-foreground rounded-md px-3 py-2 font-medium"
          type="submit"
        >
          Show statistics
        </button>
        {downloadable ? (
          <a
            className="text-body-sm text-info py-2 underline"
            href={
              `/desk/statistics/export${statisticsQueryString(filter)}` as Route
            }
          >
            Download CSV
          </a>
        ) : null}
      </form>
      {children}
    </div>
  );
}
