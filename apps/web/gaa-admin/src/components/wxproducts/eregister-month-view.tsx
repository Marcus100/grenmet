"use client";

import {
  eregisterListRegisterObservations,
  eregisterReviewRegisterDay,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  cellText,
  columnTitle,
  dayStatus,
  emptyHourText,
  type Filters,
  type HourRow,
  isDay,
  monthCounts,
  monthCsv,
  monthRange,
  monthRows,
  type Observation,
  problemMessages,
  problemsByKey,
  reviewText,
  rowMatches,
  type SourceFilter,
  type StateFilter,
  shiftMonth,
  sourceText,
  stateText,
  utcHourLabel,
  WORKBOOK_COLUMNS,
  type WorkbookColumn,
} from "./eregister-month";

const STATION_ID = "78958";
const PAGE_SIZE = 500;
/** A month is at most 744 hours plus rejected re-keys. Stop well past that. */
const MAX_PAGES = 6;
/** Superseded rows never fill an hour, so they are not fetched. */
const FETCHED_STATES = "draft,qc_pending,accepted,historical,rejected";

type LoadState = "loading" | "ready" | "forbidden" | "unavailable";

export interface MonthViewProps {
  day?: string;
  filters: Filters;
  month: string;
}

interface Loaded {
  /** False when the page cap was reached before the total. */
  complete: boolean;
  rows: Observation[];
}

/** Every SYNOP row of the month, all pages. */
async function loadMonth(month: string): Promise<Loaded | LoadState> {
  const { from, to } = monthRange(month);
  const rows: Observation[] = [];
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await eregisterListRegisterObservations({
      query: {
        kind: "SYNOP",
        limit: PAGE_SIZE,
        observed_from: from,
        observed_to: to,
        offset: page * PAGE_SIZE,
        state: FETCHED_STATES,
        station_id: STATION_ID,
      },
      throwOnError: false,
    });
    if (result.response?.status === 403) return "forbidden";
    if (result.error || !result.data) return "unavailable";
    rows.push(...result.data.observations);
    total = result.data.total ?? rows.length;
    if (rows.length >= total || result.data.observations.length < PAGE_SIZE) {
      return { complete: true, rows };
    }
  }
  return { complete: rows.length >= total, rows };
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  });
}

function queryString(month: string, day: string | undefined, filters: Filters) {
  const params = new URLSearchParams({ month });
  if (day) params.set("day", day);
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.problemsOnly) params.set("problems", "1");
  if (filters.search.trim()) params.set("q", filters.search.trim());
  return params.toString();
}

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

const REVOKE_DELAY_MS = 10_000;

const STATE_BADGE: Record<
  Observation["state"],
  "light-success" | "light-error" | "light-warning" | "light-light"
> = {
  accepted: "light-success",
  draft: "light-warning",
  historical: "light-light",
  qc_pending: "light-warning",
  rejected: "light-error",
  superseded: "light-light",
};

function Cell({
  column,
  observation,
  problems,
}: {
  column: WorkbookColumn;
  observation: Observation;
  problems: Map<string, "error" | "warning">;
}) {
  const severity = column.keys
    .map((key) => problems.get(key))
    .reduce<"error" | "warning" | undefined>(
      (worst, next) => (worst === "error" ? worst : (next ?? worst)),
      undefined
    );
  const messages = severity
    ? (observation.issues ?? [])
        .filter((issue) => column.keys.includes(issue.field ?? ""))
        .map((issue) => issue.message)
    : [];
  return (
    <td
      className={cn(
        "border-border border-r px-2 py-1 text-center font-mono tabular-nums",
        severity === "error" && "bg-destructive/10 text-destructive",
        severity === "warning" && "bg-warning-soft text-warning-soft-foreground"
      )}
      title={messages.length ? [...new Set(messages)].join("\n") : undefined}
    >
      {cellText(observation, column)}
      {severity ? (
        <span className="sr-only">
          {` (${severity}: ${[...new Set(messages)].join("; ")})`}
        </span>
      ) : null}
    </td>
  );
}

/** Rows are stable objects from useMemo, so unchanged rows skip re-rendering. */
const HourLine = memo(function HourLine({
  row,
  showDate,
}: {
  row: HourRow;
  showDate: boolean;
}) {
  const { observation } = row;
  const leading = (
    <th
      className="bg-card border-border sticky left-0 z-10 border-r px-2 py-1 text-left font-normal whitespace-nowrap tabular-nums"
      scope="row"
    >
      {showDate ? `${dayLabel(row.day)} · ` : ""}
      {String(row.hour).padStart(2, "0")}:00
      <span className="text-muted-foreground ml-1 text-xs">
        ({utcHourLabel(row.hour)} UTC)
      </span>
    </th>
  );
  if (!observation) {
    return (
      <tr className="border-border border-b">
        {leading}
        <td
          className="text-muted-foreground px-2 py-1 italic"
          colSpan={WORKBOOK_COLUMNS.length + 4}
        >
          {emptyHourText(row)}
        </td>
      </tr>
    );
  }
  const problems = problemsByKey(observation);
  const messages = problemMessages(observation);
  return (
    <tr className="border-border hover:bg-muted/40 border-b">
      {leading}
      <td className="border-border border-r px-2 py-1">
        <Badge variant={STATE_BADGE[observation.state]}>
          {stateText(observation.state)}
        </Badge>
      </td>
      <td className="border-border border-r px-2 py-1 whitespace-nowrap">
        {sourceText(observation)}
      </td>
      <td className="border-border border-r px-2 py-1 whitespace-nowrap">
        {reviewText(observation) || (
          <span className="text-muted-foreground">Not yet</span>
        )}
      </td>
      {WORKBOOK_COLUMNS.map((column) => (
        <Cell
          column={column}
          key={column.keys.join("+")}
          observation={observation}
          problems={problems}
        />
      ))}
      <td className="min-w-64 px-2 py-1 text-xs">
        {messages.length ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  );
});

/** Searching is client-side; only a submit changes the URL. */
function SearchBox({
  initial,
  onSearch,
}: {
  initial: string;
  onSearch: (search: string) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <form
      className="space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(search);
      }}
    >
      <Label htmlFor="workbook-search">Search</Label>
      <div className="flex gap-1">
        <Input
          id="workbook-search"
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Code, note, observer, problem"
          value={search}
        />
        <Button type="submit" variant="outline">
          Find
        </Button>
      </div>
    </form>
  );
}

function DayReview({ day, onDone }: { day: string; onDone: () => void }) {
  const [outcome, setOutcome] = useState<"reviewed" | "query">("reviewed");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const noteMissing = outcome === "query" && note.trim() === "";

  async function submit() {
    setBusy(true);
    setMessage("");
    const result = await eregisterReviewRegisterDay({
      body: {
        date: day,
        note: note.trim() || null,
        outcome,
        station_id: STATION_ID,
      },
      throwOnError: false,
    });
    setBusy(false);
    if (result.response?.status === 403) {
      setMessage("Your account cannot review the register.");
      return;
    }
    if (result.error || !result.data) {
      setMessage("The day could not be reviewed. Try again.");
      return;
    }
    const { reviewed, skipped_already, skipped_own } = result.data;
    const parts = [
      `${reviewed} ${reviewed === 1 ? "record" : "records"} marked ${outcome === "query" ? "as a query" : "reviewed"}.`,
    ];
    if (skipped_own) {
      parts.push(
        `${skipped_own} left for someone else: you recorded ${skipped_own === 1 ? "it" : "them"}.`
      );
    }
    if (skipped_already) {
      parts.push(`${skipped_already} already reviewed.`);
    }
    setMessage(parts.join(" "));
    setNote("");
    onDone();
  }

  return (
    <section
      aria-labelledby="day-review-title"
      className="bg-card space-y-3 rounded-lg border p-4"
    >
      <h2 className="font-semibold" id="day-review-title">
        Review {dayLabel(day)}
      </h2>
      <p className="text-muted-foreground text-sm">
        Marks every record of this day at once. Records you entered yourself and
        records already reviewed are left alone.
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Outcome</legend>
        {(["reviewed", "query"] as const).map((value) => (
          <label className="flex items-center gap-2 text-sm" key={value}>
            <input
              checked={outcome === value}
              name="day-outcome"
              onChange={() => setOutcome(value)}
              type="radio"
            />
            {value === "reviewed"
              ? "Reviewed, no problems"
              : "Query (needs a note)"}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="day-note">
          Note {outcome === "query" ? "(required)" : "(optional)"}
        </Label>
        <Textarea
          id="day-note"
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </div>
      <Button disabled={busy || noteMissing} onClick={submit} type="button">
        {busy ? "Saving…" : "Review this day"}
      </Button>
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function MonthWorkbook({ month, day, filters }: MonthViewProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>("loading");
  const [observations, setObservations] = useState<Observation[]>([]);
  const [complete, setComplete] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setState("loading");
    loadMonth(month)
      .then((result) => {
        if (!active) return;
        if (typeof result === "string") {
          setState(result);
          return;
        }
        setObservations(result.rows);
        setComplete(result.complete);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [month]);

  /** Re-read the month after a day review; a failure keeps the grid on screen. */
  function refresh() {
    setRefreshFailed(false);
    loadMonth(month)
      .then((result) => {
        if (typeof result === "string") {
          setRefreshFailed(true);
          return;
        }
        setObservations(result.rows);
        setComplete(result.complete);
      })
      .catch(() => setRefreshFailed(true));
  }

  const allRows = useMemo(
    () => monthRows(month, observations),
    [month, observations]
  );
  const scoped = useMemo(
    () => (day ? allRows.filter((row) => row.day === day) : allRows),
    [allRows, day]
  );
  const visible = useMemo(
    () => scoped.filter((row) => rowMatches(row, filters)),
    [scoped, filters]
  );
  const counts = useMemo(() => monthCounts(scoped), [scoped]);
  const dayStats = useMemo(() => dayStatus(allRows), [allRows]);
  const days = monthRange(month).days;

  function go(next: {
    month?: string;
    day?: string | null;
    filters?: Partial<Filters>;
  }) {
    const target = next.month ?? month;
    const nextDay =
      next.day === null
        ? undefined
        : (next.day ?? (next.month ? undefined : day));
    const nextFilters = { ...filters, ...next.filters };
    const url =
      `/wxproducts/hourly/month?${queryString(target, nextDay, nextFilters)}` as Route;
    // Months and days are places (Back steps through them); filters are not.
    if (next.filters) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        <PageHeader
          description="Every hour of the month, laid out like the hourly sheet. Cells with a problem are shaded; hover or read the Problems column for why."
          title={`Month workbook · ${monthLabel(month)}`}
        />
        <Link
          className="text-sm underline underline-offset-4"
          href="/wxproducts/hourly"
        >
          Back to the register
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-1">
          <Button
            aria-label="Previous month"
            onClick={() => go({ month: shiftMonth(month, -1) })}
            size="icon"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="space-y-1">
            <Label htmlFor="workbook-month">Month</Label>
            <Input
              id="workbook-month"
              onChange={(event) => {
                if (event.target.value) go({ month: event.target.value });
              }}
              type="month"
              value={month}
            />
          </div>
          <Button
            aria-label="Next month"
            onClick={() => go({ month: shiftMonth(month, 1) })}
            size="icon"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="workbook-state">State</Label>
          <NativeSelect
            id="workbook-state"
            onChange={(event) =>
              go({ filters: { state: event.target.value as StateFilter } })
            }
            value={filters.state}
          >
            <NativeSelectOption value="all">All states</NativeSelectOption>
            <NativeSelectOption value="draft">
              Awaiting acceptance
            </NativeSelectOption>
            <NativeSelectOption value="accepted">Accepted</NativeSelectOption>
            <NativeSelectOption value="historical">
              Historical
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="workbook-source">Source</Label>
          <NativeSelect
            id="workbook-source"
            onChange={(event) =>
              go({ filters: { source: event.target.value as SourceFilter } })
            }
            value={filters.source}
          >
            <NativeSelectOption value="all">All sources</NativeSelectOption>
            <NativeSelectOption value="keyed">Keyed</NativeSelectOption>
            <NativeSelectOption value="imported">Imported</NativeSelectOption>
          </NativeSelect>
        </div>
        <SearchBox
          initial={filters.search}
          key={filters.search}
          onSearch={(search) => go({ filters: { search } })}
        />
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            checked={filters.problemsOnly}
            id="workbook-problems"
            onCheckedChange={(checked) =>
              go({ filters: { problemsOnly: checked === true } })
            }
          />
          <Label htmlFor="workbook-problems">Problems only</Label>
        </div>
        <Button
          className="ml-auto"
          disabled={state !== "ready"}
          onClick={() =>
            downloadCsv(
              `eregister-${STATION_ID}-${day ?? month}.csv`,
              monthCsv(visible)
            )
          }
          variant="outline"
        >
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <nav aria-label="Days of the month" className="flex flex-wrap gap-1">
        <Button
          aria-current={day ? undefined : "page"}
          onClick={() => go({ day: null })}
          size="sm"
          variant={day ? "outline" : "default"}
        >
          Whole month
        </Button>
        {days.map((value) => {
          const { flagged, recorded } = dayStats.get(value) ?? {
            flagged: false,
            recorded: 0,
          };
          return (
            <Button
              aria-current={value === day ? "page" : undefined}
              aria-label={`${dayLabel(value)}: ${recorded} of 24 hours recorded${flagged ? ", has problems" : ""}`}
              className="relative w-10 tabular-nums"
              key={value}
              onClick={() => go({ day: value })}
              size="sm"
              variant={value === day ? "default" : "outline"}
            >
              {Number(value.slice(8))}
              {flagged ? (
                <span
                  aria-hidden="true"
                  className="bg-warning absolute top-0.5 right-0.5 size-1.5 rounded-full"
                />
              ) : null}
            </Button>
          );
        })}
      </nav>

      {state === "loading" ? (
        <p role="status">Loading {monthLabel(month)}…</p>
      ) : null}
      {state === "forbidden" ? (
        <p className="rounded-lg border px-4 py-3 text-sm" role="alert">
          You don't have access to the observation register. Ask an
          administrator for the eRegister observer or reviewer role.
        </p>
      ) : null}
      {state === "unavailable" ? (
        <p className="rounded-lg border px-4 py-3 text-sm" role="alert">
          The register could not be loaded. Try again shortly.
        </p>
      ) : null}
      {state === "ready" && !complete ? (
        <p className="rounded-lg border px-4 py-3 text-sm" role="alert">
          This month holds more records than the workbook can load at once, so
          some hours below may show as not recorded when they were.
        </p>
      ) : null}
      {refreshFailed ? (
        <p className="rounded-lg border px-4 py-3 text-sm" role="alert">
          The review was saved, but the list could not refresh. Reload the page
          to see the new review states.
        </p>
      ) : null}

      {state === "ready" ? (
        <>
          <p className="text-muted-foreground text-sm" role="status">
            {day ? dayLabel(day) : monthLabel(month)}: {counts.recorded} of{" "}
            {scoped.length} hours recorded · {counts.missing} not recorded ·{" "}
            {counts.rejected
              ? `${counts.rejected} rejected, not replaced · `
              : ""}
            {counts.historical} historical · {counts.accepted} accepted ·{" "}
            {counts.draft} awaiting acceptance · {counts.withProblems} with
            problems · {counts.reviewed} reviewed
            {visible.length === scoped.length
              ? ""
              : ` · showing ${visible.length} after filters`}
          </p>

          {day && isDay(day, month) ? (
            <DayReview day={day} onDone={refresh} />
          ) : null}

          {visible.length === 0 ? (
            <p className="rounded-lg border px-4 py-3 text-sm" role="status">
              No hours match these filters.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-lg border">
              <table className="text-body-sm w-max border-collapse">
                <caption className="sr-only">
                  Hourly register for {day ? dayLabel(day) : monthLabel(month)}
                </caption>
                <thead className="bg-muted sticky top-0 z-20">
                  <tr>
                    <th
                      className="bg-muted border-border sticky left-0 z-30 border-r border-b px-2 py-1 text-left"
                      scope="col"
                    >
                      Local time
                    </th>
                    <th
                      className="border-border border-r border-b px-2 py-1"
                      scope="col"
                    >
                      State
                    </th>
                    <th
                      className="border-border border-r border-b px-2 py-1"
                      scope="col"
                    >
                      Source
                    </th>
                    <th
                      className="border-border border-r border-b px-2 py-1"
                      scope="col"
                    >
                      Review
                    </th>
                    {WORKBOOK_COLUMNS.map((column) => (
                      <th
                        className="border-border border-r border-b px-2 py-1 font-mono text-xs"
                        key={column.keys.join("+")}
                        scope="col"
                        title={columnTitle(column)}
                      >
                        {column.code || column.label}
                        <span className="sr-only"> {column.label}</span>
                      </th>
                    ))}
                    <th
                      className="border-border border-b px-2 py-1 text-left"
                      scope="col"
                    >
                      Problems
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <HourLine
                      key={`${row.day}-${row.hour}`}
                      row={row}
                      showDate={!day}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
