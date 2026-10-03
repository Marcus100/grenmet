"use client";

import type {
  ArchiveEdition,
  ArchiveHistory,
  ArchivePage,
} from "@barrelsgd/api-client";
import { archiveBulletinSchema } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getImageUrl } from "@/lib/wxwatch/utils";

export function ArchiveBrowser({
  archive,
  history,
  edition,
  query,
  nhcOnly = false,
}: {
  archive: ArchivePage;
  history: ArchiveHistory | null;
  edition?: string;
  query: string;
  nhcOnly?: boolean;
}) {
  const params = new URLSearchParams(query);
  const basePath = nhcOnly ? "/wxproducts/nhc" : "/wxwatch/archive";
  const [selected, setSelected] = useState<ArchiveEdition[]>([]);
  function href(updates: Record<string, string>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(updates)) next.set(key, value);
    return `${basePath}?${next}`;
  }
  function toggle(item: ArchiveEdition) {
    setSelected((current) =>
      current.some((row) => row.id === item.id)
        ? current.filter((row) => row.id !== item.id)
        : [...current, item].slice(-2)
    );
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-semibold text-2xl">
          {nhcOnly ? "NHC guidance" : "WxWatch archive"}
        </h1>
        <p className="text-muted-foreground">
          All catalogued editions. Times are UTC; estimates remain labelled.
        </p>
        <Link className="text-sm underline" href="/wxwatch">
          Synoptic gallery
        </Link>
      </header>
      <form
        action={basePath}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="space-y-1 text-sm">
          Source
          <select
            className="block w-full rounded-md border bg-background p-2"
            defaultValue={params.get("source") ?? ""}
            name="source"
          >
            {!nhcOnly && <option value="">All sources</option>}
            {(nhcOnly
              ? ["nhc"]
              : ["goes19", "sfcana", "cimss", "trackthetropics", "uwyo", "nhc"]
            ).map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm" htmlFor="archive-product">
          Product
          <Input
            defaultValue={params.get("product") ?? ""}
            id="archive-product"
            name="product"
            placeholder="Name or product key"
          />
        </label>
        <label className="space-y-1 text-sm" htmlFor="archive-start">
          From (UTC)
          <Input
            defaultValue={params.get("start") ?? ""}
            id="archive-start"
            name="start"
            type="date"
          />
        </label>
        <label className="space-y-1 text-sm" htmlFor="archive-end">
          Through (UTC)
          <Input
            defaultValue={params.get("end") ?? ""}
            id="archive-end"
            name="end"
            type="date"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            defaultChecked={params.get("unknown_time") === "true"}
            name="unknown_time"
            type="checkbox"
            value="true"
          />
          Unknown time only (clear dates)
        </label>
        <Button type="submit">Search archive</Button>
      </form>
      <section aria-label="Edition comparison" className="space-y-3">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">
            Compare editions ({selected.length}/2)
          </h2>
          {selected.length > 0 && (
            <Button onClick={() => setSelected([])} variant="outline">
              Clear comparison
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Select up to two editions, including across result pages. This is a
          visual comparison, not numerical verification.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {selected.map((item) => (
            <article className="space-y-2 rounded-lg border p-4" key={item.id}>
              <h3 className="font-medium">{item.title}</h3>
              <EditionEvidence item={item} />
              <ArchiveContent item={item} />
            </article>
          ))}
        </div>
      </section>
      {archive.items.length === 0 ? (
        <p>No editions match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {archive.items.map((item) => (
            <li className="space-y-3 rounded-lg border p-4" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{item.title}</h2>
                  <p className="text-muted-foreground text-sm">{item.source}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    aria-label={`Compare ${item.title} ${item.id}`}
                    checked={selected.some((row) => row.id === item.id)}
                    onChange={() => toggle(item)}
                    type="checkbox"
                  />
                  Compare
                </label>
              </div>
              <EditionEvidence item={item} />
              <Link
                className="text-sm underline"
                href={href({ edition: item.id, history_offset: "0" })}
              >
                Retrieval history
              </Link>
              <details>
                <summary className="cursor-pointer text-sm">
                  {item.has_bulletin ? "View bulletin" : "View image"}
                </summary>
                <ArchiveContent item={item} />
              </details>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Archive pages" className="flex gap-4">
        {archive.offset > 0 && (
          <Link
            className="underline"
            href={href({ offset: String(Math.max(0, archive.offset - 30)) })}
          >
            Previous editions
          </Link>
        )}
        {archive.has_more && (
          <Link
            className="underline"
            href={href({ offset: String(archive.offset + 30) })}
          >
            Next editions
          </Link>
        )}
      </nav>
      {history && (
        <section
          aria-label="Retrieval history"
          className="space-y-3 rounded-lg border p-4"
        >
          <h2 className="font-semibold">Retrieval history</h2>
          <p className="break-all text-muted-foreground text-sm">
            Edition {edition}
          </p>
          {history.items.length === 0 ? (
            <p>
              No retrieval history recorded. Historical downloads were not
              reconstructed.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.items.map((item) => (
                <li key={item.id}>
                  <p>
                    {item.event_kind === "checked_unchanged"
                      ? "Checked unchanged"
                      : "Downloaded"}
                  </p>
                  <p>Originally retrieved: {utc(item.retrieved_at)}</p>
                  {item.checked_at && <p>Checked: {utc(item.checked_at)}</p>}
                  <p>
                    {item.is_imported ? "Imported" : "Recorded"}:{" "}
                    {utc(item.recorded_at)}
                  </p>
                  <p className="break-all text-muted-foreground text-sm">
                    {item.image_url}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Retrieval pages" className="flex gap-4">
            {history.offset > 0 && (
              <Link
                className="underline"
                href={href({
                  edition: edition ?? "",
                  history_offset: String(Math.max(0, history.offset - 30)),
                })}
              >
                Previous retrievals
              </Link>
            )}
            {history.has_more && (
              <Link
                className="underline"
                href={href({
                  edition: edition ?? "",
                  history_offset: String(history.offset + 30),
                })}
              >
                Next retrievals
              </Link>
            )}
          </nav>
        </section>
      )}
    </div>
  );
}

function utc(value: string | null) {
  return value
    ? `${new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC")}`
    : "Unknown";
}
function EditionEvidence({ item }: { item: ArchiveEdition }) {
  let label = "Nominal time (unverified)";
  if (item.time_basis === "estimated_analysis")
    label = "Estimated analysis time";
  if (item.observed_at) label = "Observation time";
  if (item.source === "nhc") label = "Issue time";

  return (
    <div className="space-y-1 text-sm">
      <p>
        {label}:{" "}
        {utc(
          item.source === "nhc"
            ? (item.issued_at ?? null)
            : (item.observed_at ?? item.nominal_time)
        )}
      </p>
      {item.has_bulletin && (
        <p>
          Bulletin: {item.bulletin_code ?? "Unknown"} · Storm:{" "}
          {item.storm_id ?? "Not specified"}
        </p>
      )}
      <p>Time evidence: {item.time_basis.replaceAll("_", " ")}</p>
      <p>First retrieved: {utc(item.first_received_at)}</p>
      {!item.has_bulletin && (
        <p>
          File record: {item.verification_status ?? "Unknown"} · Local replica:{" "}
          {item.replica_state ?? "Unknown"}
        </p>
      )}
    </div>
  );
}
function ArchiveImage({ item }: { item: ArchiveEdition }) {
  const [failed, setFailed] = useState(false);
  let imageUrl = item.storage_path ? getImageUrl(item.storage_path) : null;
  if (item.image_asset_id) {
    imageUrl = `/_backend/wxwatch/assets/${encodeURIComponent(item.image_asset_id)}`;
  }
  if (
    !imageUrl ||
    failed ||
    item.replica_state === "missing" ||
    item.replica_state === "failed"
  )
    return <p>Image unavailable. Its archive record is retained.</p>;
  return (
    <div className="space-y-2">
      <a
        className="text-sm underline"
        href={imageUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open full-size image
      </a>
      <div className="relative h-96 bg-muted">
        <Image
          alt={item.title}
          className="object-contain"
          fill
          onError={() => setFailed(true)}
          sizes="(min-width: 1024px) 50vw, 100vw"
          src={imageUrl}
          unoptimized
        />
      </div>
    </div>
  );
}

function ArchiveContent({ item }: { item: ArchiveEdition }) {
  if (item.has_bulletin) return <BulletinText edition={item.id} />;
  return <ArchiveImage item={item} />;
}
function BulletinText({ edition }: { edition: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function load() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(
        `/_backend/wxwatch/archive/${encodeURIComponent(edition)}/bulletin`,
        {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!response.ok) throw new Error("Unavailable");
      setBody(archiveBulletinSchema.parse(await response.json()).text);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  if (body !== null)
    return (
      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
        {body}
      </pre>
    );
  return (
    <div className="space-y-2">
      {error && <p role="alert">Bulletin unavailable. Please retry.</p>}
      <Button disabled={pending} onClick={load} variant="outline">
        {pending ? "Loading bulletin…" : "Load bulletin text"}
      </Button>
    </div>
  );
}
