import "server-only";

import { observationListSchema } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

type Filters = Record<string, string | string[] | undefined>;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

export function observationFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  const kind = filters.kind ?? "SYNOP";
  if (typeof kind !== "string" || !["SYNOP", "METAR", "SPECI"].includes(kind)) {
    throw new Error("Choose SYNOP, METAR or SPECI.");
  }
  params.set("kind", kind);
  for (const field of ["station", "start", "end", "limit"]) {
    const value = filters[field];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string")
      throw new Error("Choose one value per filter.");
    if (field === "station") {
      if (value.trim().length > 32)
        throw new Error("Station must be at most 32 characters.");
      if (value.trim()) params.set(field, value.trim());
    } else if (field === "limit") {
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw new Error("Choose a limit between 1 and 500.");
      }
      params.set(field, String(limit));
    } else {
      if (!DATE_TIME.test(value))
        throw new Error("Enter valid UTC dates and times.");
      const date = new Date(`${value}Z`);
      if (
        Number.isNaN(date.getTime()) ||
        !date.toISOString().startsWith(value)
      ) {
        throw new Error("Enter valid UTC dates and times.");
      }
      params.set(field, date.toISOString());
    }
  }
  if ((params.get("start") ?? "") > (params.get("end") ?? "9999")) {
    throw new Error("The end must be at or after the start.");
  }
  if (!params.has("limit")) params.set("limit", "100");
  return params;
}

export async function loadImportedObservations(filters: Filters) {
  const params = observationFilters(filters);
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view imported observations.");
  const response = await fetch(
    new URL(
      `${getAuthApiPrefix()}/wxproducts/observations?${params}`,
      getAuthApiBaseUrl()
    ),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (response.status === 401)
    throw new Error("Sign in again to view imported observations.");
  if (response.status === 403)
    throw new Error("Your account cannot view imported observations.");
  if (!response.ok)
    throw new Error("Imported observations are unavailable. Try again later.");
  return observationListSchema.parse(await response.json());
}

function FilterForm({ filters }: { filters: Filters }) {
  const value = (key: string, fallback = "") =>
    typeof filters[key] === "string" ? filters[key] : fallback;
  return (
    <form
      action="/wxproducts/hourly"
      className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3"
      method="get"
    >
      <input name="view" type="hidden" value="imported" />
      <div className="space-y-2">
        <Label htmlFor="observation-kind">Report kind</Label>
        <select
          className="w-full rounded-md border bg-background p-2"
          defaultValue={value("kind", "SYNOP")}
          id="observation-kind"
          name="kind"
        >
          <option>SYNOP</option>
          <option>METAR</option>
          <option>SPECI</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="observation-station">Station (optional)</Label>
        <Input
          defaultValue={value("station")}
          id="observation-station"
          maxLength={32}
          name="station"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="observation-limit">Maximum records</Label>
        <Input
          defaultValue={value("limit", "100")}
          id="observation-limit"
          max={500}
          min={1}
          name="limit"
          type="number"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="observation-start">Start (UTC)</Label>
        <Input
          defaultValue={value("start")}
          id="observation-start"
          name="start"
          type="datetime-local"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="observation-end">End (UTC)</Label>
        <Input
          defaultValue={value("end")}
          id="observation-end"
          name="end"
          type="datetime-local"
        />
      </div>
      <Button className="self-end" type="submit">
        Load observations
      </Button>
    </form>
  );
}

export async function ImportedObservations({ filters }: { filters: Filters }) {
  let result: Awaited<ReturnType<typeof loadImportedObservations>> | undefined;
  let error = "";
  try {
    result = await loadImportedObservations(filters);
  } catch (cause) {
    // Filter and access errors are actionable; don't expose upstream payloads.
    error =
      cause instanceof Error &&
      !["TypeError", "ZodError", "TimeoutError"].includes(cause.name)
        ? cause.message
        : "Imported observations could not be loaded. Try again later.";
  }
  return (
    <section className="space-y-4">
      <h1 className="font-semibold text-2xl">Imported observations</h1>
      <p>
        Read-only source records, separate from staff-entered eRegister drafts.
        Publication status is shown only as reported by the source.
      </p>
      <FilterForm filters={filters} />
      {error ? <p role="alert">{error}</p> : null}
      {result?.observations.length === 0 ? (
        <p role="status">No imported observations match these filters.</p>
      ) : null}
      {result?.observations.map((record) => (
        <article
          className="space-y-3 rounded-lg border bg-card p-4"
          key={record.id}
        >
          <h2 className="font-semibold">
            {record.kind} · {record.station}
          </h2>
          <p>
            Observed: {record.observed_at ?? "Unknown"} · Issued:{" "}
            {record.issued_at ?? "Unknown"}
          </p>
          <p>
            Source: {record.provenance.source_system} · Time basis:{" "}
            {record.provenance.time_basis} · Publication:{" "}
            {record.provenance.publication_state}
          </p>
          <pre className="whitespace-pre-wrap break-words text-sm">
            {record.provenance.raw_tac ?? "No source TAC supplied."}
          </pre>
          {record.provenance.quality_flags?.length ? (
            <p>Quality flags: {record.provenance.quality_flags.join(", ")}</p>
          ) : null}
          <details>
            <summary>Source payload and provenance</summary>
            <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(record, null, 2)}
            </pre>
          </details>
        </article>
      ))}
      {result ? (
        <p className="text-muted-foreground text-sm">
          Showing {result.observations.length} records, up to the selected
          limit. Narrow the time range to inspect other observations.
        </p>
      ) : null}
    </section>
  );
}
