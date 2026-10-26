"use client";

import {
  type NhcContent,
  type NhcJob,
  type NhcPage,
  nhcContentSchema,
  nhcJobSchema,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { reportError } from "@/lib/report-error";
import { NHC_FAMILIES, nhcRequest } from "@/lib/wxproducts/nhc-api";
import { NhcContentView, RecordTable } from "./nhc-content";

const UTC_SUFFIX = /(?:Z|\+00:00)$/;
function utc(value: string | null | undefined) {
  return value
    ? `${value.replace("T", " ").replace(UTC_SUFFIX, "")} UTC`
    : "Unknown";
}

export function NhcWorkspace({
  archive,
  query,
  loadError,
}: {
  archive: NhcPage | null;
  query: string;
  loadError?: string;
}) {
  const router = useRouter();
  const params = new URLSearchParams(query);
  const [families, setFamilies] = useState<string[]>(Object.keys(NHC_FAMILIES));
  const [job, setJob] = useState<NhcJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [contents, setContents] = useState<NhcContent[]>([]);
  const edition = params.get("edition");
  const compare =
    params.get("compare")?.split(",").filter(Boolean).slice(0, 2) ?? [];
  const contentKey = [...new Set([edition, ...compare].filter(Boolean))].join(
    ","
  );
  const requestId = params.get("request");
  function href(updates: Record<string, string>): Route {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/wxproducts/nhc?${next}`;
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry must reload the same selected editions.
  useEffect(() => {
    let cancelled = false;
    setContents([]);
    if (!contentKey) return;
    Promise.all(
      contentKey
        .split(",")
        .map((id) =>
          nhcRequest(`editions/${encodeURIComponent(id)}`, nhcContentSchema)
        )
    )
      .then((result) => {
        if (!cancelled) setContents(result);
      })
      .catch((caught) => {
        reportError(caught, "wxproducts-nhc");
        if (!cancelled)
          setError(
            "Could not read the selected edition. Try opening it again."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [contentKey, retry]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry must resume checking the existing request.
  useEffect(() => {
    if (
      !requestId ||
      (job?.id === requestId && !["queued", "running"].includes(job.status))
    )
      return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const current = await nhcRequest(
          `jobs/${encodeURIComponent(requestId)}`,
          nhcJobSchema
        );
        if (cancelled) return;
        setJob(current);
        if (!["queued", "running"].includes(current.status)) router.refresh();
      } catch (caught) {
        reportError(caught, "wxproducts-nhc");
        if (!cancelled)
          setError("Could not check pull progress. Reload this page to retry.");
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [requestId, job, router, retry]);
  async function pull() {
    setBusy(true);
    setError("");
    try {
      const request = await nhcRequest("pulls", nhcJobSchema, { families });
      setJob(request);
      router.replace(href({ request: request.id }));
    } catch (caught) {
      reportError(caught, "wxproducts-nhc");
      setError(
        caught instanceof Error ? caught.message : "Could not request a pull"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        description="Pull guidance when needed and inspect collected NHC source editions."
        title="NHC guidance"
      />
      <section
        aria-label="Pull NHC guidance"
        className="space-y-3 rounded-lg border p-4"
      >
        <div className="flex flex-wrap gap-4">
          {Object.entries(NHC_FAMILIES).map(([key, name]) => (
            <label className="flex items-center gap-2" key={key}>
              <input
                checked={families.includes(key)}
                onChange={(event) =>
                  setFamilies((current) =>
                    event.target.checked
                      ? [...current, key]
                      : current.filter((family) => family !== key)
                  )
                }
                type="checkbox"
              />
              {name}
            </label>
          ))}
        </div>
        <Button
          disabled={
            busy ||
            families.length === 0 ||
            Boolean(job && ["queued", "running"].includes(job.status))
          }
          onClick={pull}
          type="button"
        >
          Pull latest NHC products
        </Button>
        <p className="text-muted-foreground text-sm">
          Collection is on demand. Last successful editions stay available
          between pulls.
        </p>
        {job && (
          <div className="space-y-2">
            <p aria-live="polite">
              Pull: {job.status}
              {job.error && ` · ${job.error}`}
            </p>
            <RecordTable rows={job.result?.products} />
          </div>
        )}
      </section>
      {(error || loadError) && (
        <div role="alert">
          <p>{error || loadError}</p>
          <Button
            onClick={() => {
              setError("");
              setRetry((current) => current + 1);
              router.refresh();
            }}
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      )}
      <form action="/wxproducts/nhc" className="flex flex-wrap items-end gap-3">
        <label>
          View
          <select
            className="block rounded-md border bg-background p-2"
            defaultValue={params.get("latest") ?? "true"}
            name="latest"
          >
            <option value="true">Latest active products</option>
            <option value="false">Collected history</option>
          </select>
        </label>
        <label>
          Family
          <select
            className="block rounded-md border bg-background p-2"
            defaultValue={params.get("family") ?? ""}
            name="family"
          >
            <option value="">All families</option>
            {Object.entries(NHC_FAMILIES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="nhc-product">
          Product
          <Input
            className="w-52"
            defaultValue={params.get("product") ?? ""}
            id="nhc-product"
            name="product"
          />
        </label>
        <label htmlFor="nhc-storm">
          Storm ID
          <Input
            className="w-36"
            defaultValue={params.get("storm") ?? ""}
            id="nhc-storm"
            name="storm"
            placeholder="al012026"
          />
        </label>
        <label htmlFor="nhc-start">
          From (UTC)
          <Input
            defaultValue={params.get("start") ?? ""}
            id="nhc-start"
            name="start"
            type="date"
          />
        </label>
        <label htmlFor="nhc-end">
          Through (UTC)
          <Input
            defaultValue={params.get("end") ?? ""}
            id="nhc-end"
            name="end"
            type="date"
          />
        </label>
        <input
          name="request"
          type="hidden"
          value={params.get("request") ?? ""}
        />
        <input name="edition" type="hidden" value={edition ?? ""} />
        <input name="compare" type="hidden" value={compare.join(",")} />
        <Button type="submit">Filter guidance</Button>
      </form>
      {archive?.items.length === 0 && (
        <p>
          No collected editions match. Pull guidance or adjust the filters; this
          does not establish that no weather systems exist.
        </p>
      )}
      {archive && archive.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Product / storm</th>
                <th className="p-2 text-left">Source issue</th>
                <th className="p-2 text-left">Last check / status</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {archive.items.map((item) => (
                <tr className="border-t" key={item.id}>
                  <td className="p-2">
                    <strong>{item.title}</strong>
                    <p>
                      {NHC_FAMILIES[item.family]}
                      {item.storm_id && ` · ${item.storm_id.toUpperCase()}`}
                    </p>
                    <p className="text-muted-foreground text-xs">{item.kind}</p>
                  </td>
                  <td className="p-2">{utc(item.issued_at)}</td>
                  <td className="p-2">
                    {utc(item.last_checked_at)}
                    <p>Attempted: {utc(item.last_attempted_at)}</p>
                    <p>
                      {item.status}
                      {item.stale === true && " · Older guidance"}
                      {item.stale === null && " · Age unknown"}
                      {!item.active && " · Inactive"}
                    </p>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-3">
                      <Link
                        className="underline"
                        href={href({ edition: item.id })}
                      >
                        Open
                      </Link>

                      <Link
                        className="underline"
                        href={href({
                          compare: compare.includes(item.id)
                            ? compare.filter((id) => id !== item.id).join(",")
                            : [...compare, item.id].slice(-2).join(","),
                        })}
                      >
                        {compare.includes(item.id)
                          ? "Remove comparison"
                          : "Compare"}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {archive && (
        <nav aria-label="Guidance pages" className="flex gap-3">
          {archive.offset > 0 && (
            <Link
              className="underline"
              href={href({ offset: String(Math.max(0, archive.offset - 30)) })}
            >
              Previous
            </Link>
          )}
          {archive.has_more && (
            <Link
              className="underline"
              href={href({ offset: String(archive.offset + 30) })}
            >
              Next
            </Link>
          )}
        </nav>
      )}
      {contentKey && contents.length === 0 && !error && (
        <p role="status">Loading selected editions…</p>
      )}
      <div
        className={
          contents.length > 1 ? "grid gap-4 xl:grid-cols-2" : "space-y-4"
        }
      >
        {contents.map((content) => (
          <article
            className="space-y-3 rounded-lg border p-4"
            key={content.edition.id}
          >
            <h2 className="font-semibold text-lg">{content.edition.title}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {Object.entries({
                "Source issue": content.edition.issued_at,
                "WMO header": content.edition.header_issued_at,
                Observation: content.edition.observed_at,
                "Analysis / cycle": content.edition.reference_time,
                "Valid from": content.edition.valid_start,
                "Valid through": content.edition.valid_end,
                "First received": content.edition.first_received_at,
                "Last checked": content.edition.last_checked_at,
                "Last attempted": content.edition.last_attempted_at,
              }).map(([label, time]) => (
                <div className="contents" key={label}>
                  <dt>{label}</dt>
                  <dd>{utc(time)}</dd>
                </div>
              ))}
            </dl>
            <NhcContentView content={content} />
          </article>
        ))}
      </div>
    </div>
  );
}
