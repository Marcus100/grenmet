import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlatMap } from "@/components/map/flat-map";
import { SeatSquare } from "@/components/party-chip";
import { CandidateTable } from "@/components/results/candidate-table";
import { Provenance } from "@/components/results/provenance";
import { SeatBar } from "@/components/results/seat-bar";
import { StationTable } from "@/components/results/station-table";
import { PageHead, Section } from "@/components/section";
import {
  eventDivisions,
  eventFromSlug,
  eventHeadline,
  eventNational,
  eventResult,
  eventSlug,
  eventSource,
  eventTitle,
  resultNotes,
  sideLabel,
  turnoutNote,
} from "@/data/events";
import { metricEvidence } from "@/data/evidence";
import { data, geo, results } from "@/data/load";
import {
  CODES,
  constituencyHref,
  constituencyName,
  contestStats,
  type ElectionEvent,
  EVENTS,
  getEvent,
} from "@/data/model";
import { partyColor, partyInfo } from "@/data/parties";
import { fmt, pct } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string }>;
}

interface Gazette1972 {
  cands: [string, string];
  /** [division, polling station, electors, first candidate, second candidate] */
  rows: [string, string, number, number, number][];
}

export function generateStaticParams() {
  return EVENTS.map((e) => ({ slug: eventSlug(e.id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = eventFromSlug((await params).slug);
  const e = id ? getEvent(id) : undefined;
  if (!e) return {};
  const title =
    e.kind === "ref" ? `${e.year} referendum` : `${e.year} general election`;
  return {
    title,
    description: `${title} in Grenada (${e.date}): ${eventHeadline(data, e.id)}. Every constituency’s result with its source.`,
  };
}

function winnerText(
  kind: ElectionEvent["kind"],
  w: [string, string, number, unknown?] | undefined
): string {
  if (!w) return "no readable result";
  return kind === "ref"
    ? `${sideLabel(w[1])} ahead`
    : `${w[0]}, ${partyInfo(w[1]).name}`;
}

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";

export default async function EventPage({ params }: Props) {
  const id = eventFromSlug((await params).slug);
  const e = id ? getEvent(id) : undefined;
  if (!e) notFound();

  const n = eventNational(data, e.id);
  const source = eventSource(data, e.id);
  const note = turnoutNote(n.turnoutSource);
  const shares = Object.entries(n.votes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const label = sideLabel;
  const index = EVENTS.findIndex((x) => x.id === e.id);
  const prev: ElectionEvent | undefined = EVENTS[index - 1];
  const next: ElectionEvent | undefined = EVENTS[index + 1];

  const blocks = e.map
    ? CODES.flatMap((code) => {
        const r = eventResult(data, e.id, code);
        return r ? [{ code, name: constituencyName(results, code), r }] : [];
      })
    : (results.early[e.id] ?? []).map((r) => ({ code: null, name: r.name, r }));

  return (
    <>
      <PageHead
        deck={eventHeadline(data, e.id)}
        eyebrow={`${e.kind === "ref" ? "Constitutional referendum" : "General election"} · ${e.date}`}
        learning="results"
        title={eventTitle(e.id)}
      >
        {e.kind === "general" && (
          <SeatBar className="mt-5 max-w-md" seats={n.seats} />
        )}
        <dl className="mt-5 grid grid-cols-2 gap-4 border-el-rule border-t pt-4 sm:grid-cols-3 lg:grid-cols-6">
          {shares.map(([p, v]) => (
            <div key={p}>
              <dt className={LABEL}>{label(p)}</dt>
              <dd
                className="mt-0.5 font-semibold text-xl tabular-nums"
                style={{ color: partyColor(p, "ink") }}
              >
                {pct(v / n.total)}
              </dd>
              <dd className="text-base text-el-muted tabular-nums">
                {fmt(v)} votes
              </dd>
            </div>
          ))}
          <div>
            <dt className={LABEL}>Turnout</dt>
            <dd className="mt-0.5 font-semibold text-xl tabular-nums">
              {pct(n.turnout)}
            </dd>
            <dd className="text-base text-el-muted tabular-nums">
              {fmt(n.registered)} registered
            </dd>
          </div>
        </dl>
        <div className="mt-4 space-y-2 text-base">
          {(["votes", "seats", "turnout"] as const)
            .filter((metric) => e.kind === "general" || metric !== "seats")
            .map((metric) => {
              const evidence = metricEvidence(data, e.id, metric);
              return (
                <details key={metric}>
                  <summary className="cursor-pointer">
                    {metric}: {evidence.label}
                  </summary>
                  <p className="mt-2 text-el-ink-2 leading-relaxed">
                    {evidence.formula} {evidence.note}
                  </p>
                </details>
              );
            })}
        </div>
        <Provenance official={source.official} text={source.text}>
          {note && `${note}.`}
        </Provenance>
        <nav
          aria-label="Other elections"
          className="mt-4 flex justify-between gap-4 text-base"
        >
          {prev ? (
            <Link
              className="underline underline-offset-4"
              href={`/elections/${eventSlug(prev.id)}`}
            >
              ← {prev.year}
              {prev.sub ? ` ${prev.sub.toLowerCase()}` : ""}
            </Link>
          ) : (
            <span />
          )}
          <Link className="underline underline-offset-4" href="/elections">
            All elections
          </Link>
          {next ? (
            <Link
              className="underline underline-offset-4"
              href={`/elections/${eventSlug(next.id)}`}
            >
              {next.year}
              {next.sub ? ` ${next.sub.toLowerCase()}` : ""} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </PageHead>

      {e.id === "2016r" && n.bills && (
        <Section
          id="bills"
          intro={`${data.referendum["2016"].billsSource}.`}
          title="Result by bill"
        >
          <ul className="space-y-2">
            {n.bills.map(([title, yes, no]) => (
              <li
                className="grid items-center gap-x-4 gap-y-1 text-base sm:grid-cols-[minmax(0,1fr)_40%_5rem]"
                key={title}
              >
                <span>{title}</span>
                <span className="flex h-3 gap-px">
                  <span
                    style={{
                      width: `${(yes / (yes + no)) * 100}%`,
                      background: partyColor("YES"),
                    }}
                  />
                  <span
                    className="flex-1"
                    style={{ background: partyColor("NO") }}
                  />
                </span>
                <span className="text-right tabular-nums">
                  Yes {pct(yes / (yes + no), 0)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-base text-el-muted leading-relaxed">
            {data.referendum["2016"].note}{" "}
            {data.referendum["2016"].totalsSource}.
          </p>
        </Section>
      )}

      {e.id === "2018r" && (
        <Section id="damaged" title="What the Gazette shows">
          <p className="max-w-[70ch] text-el-ink-2 leading-relaxed">
            {data.referendum["2018"].note} Yes{" "}
            {fmt(data.referendum["2018"].yes)}, No{" "}
            {fmt(data.referendum["2018"].no)}, invalid{" "}
            {fmt(data.referendum["2018"].invalid)}.
          </p>
        </Section>
      )}

      {e.map && (
        <Section
          id="map"
          title={
            e.kind === "ref"
              ? "Which side led in each constituency"
              : "Winner in each constituency"
          }
        >
          <FlatMap
            className="max-w-xl"
            geo={geo}
            label={`${e.label} result by constituency`}
            regions={CODES.map((code) => {
              const r = eventResult(data, e.id, code);
              const w = r?.c[0];
              return {
                code,
                fill: w ? partyColor(w[1]) : "var(--el-paper-2)",
                href: constituencyHref(results, code),
                title: `${constituencyName(results, code)}: ${winnerText(e.kind, w)}`,
              };
            })}
          />
        </Section>
      )}

      {!e.map && (
        <Section id="boundaries" title="Different boundaries">
          <p className="max-w-[70ch] text-el-ink-2 leading-relaxed">
            Before 1972 Grenada had {blocks.length} constituencies with
            different boundaries, so these results aren’t drawn on today’s map.
            {source.partial &&
              " Winners’ votes are checked against the Government Gazette; figures marked ✱ come from a secondary compilation."}
          </p>
        </Section>
      )}

      <Section
        id="results"
        title={
          e.map
            ? "Every constituency"
            : "Every constituency (earlier boundaries)"
        }
      >
        <div className="grid gap-px border border-el-rule bg-el-rule md:grid-cols-2">
          {blocks.map(({ code, name, r }) => {
            const s = contestStats(r);
            const prov = code ? eventSource(data, e.id, code) : null;
            const gazette = (r as { divisions?: Gazette1972 }).divisions;
            return (
              <article
                className="bg-background p-4"
                id={code ?? undefined}
                key={code ?? name}
              >
                <header className="flex items-start gap-3">
                  {code && (
                    <SeatSquare
                      className="size-7 shrink-0"
                      code={code}
                      label={`${partyInfo(s.winner[1]).name} ${e.kind === "ref" ? "ahead" : "won"}`}
                      party={s.winner[1]}
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg leading-tight">
                      {code ? (
                        <Link
                          className="hover:underline"
                          href={constituencyHref(results, code)}
                        >
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </h3>
                    <p className="text-base text-el-muted tabular-nums leading-relaxed">
                      {e.kind === "ref" ? "Lead" : "Majority"} {fmt(s.majority)}{" "}
                      · Turnout {pct(s.turnout)} · Registered {fmt(r.reg)}
                      {r.derived && " · derived total"}
                    </p>
                  </div>
                </header>
                <div className="mt-2">
                  <CandidateTable caption={`${name}, ${e.label}`} rows={r.c} />
                </div>
                {resultNotes(r, e.year).map((t) => (
                  <p
                    className="mt-2 text-base text-el-ink-2 leading-relaxed"
                    key={t}
                  >
                    <b>Note:</b> {t}
                  </p>
                ))}
                {prov?.text.includes("p.") && (
                  <p className="mt-1 text-base text-el-muted leading-relaxed">
                    {prov.text}.
                  </p>
                )}
                {gazette && (
                  <details className="mt-3 border-el-rule border-t pt-2">
                    <summary className="cursor-pointer font-semibold text-base">
                      {gazette.rows.length} polling divisions, 1972
                    </summary>
                    <table className="mt-2 w-full text-base">
                      <thead>
                        <tr className="border-el-ink border-b text-left">
                          <th className="py-1 pr-2 font-semibold" scope="col">
                            Division
                          </th>
                          <th className="py-1 pr-2 font-semibold" scope="col">
                            Polling station
                          </th>
                          <th
                            className="py-1 pr-2 text-right font-semibold"
                            scope="col"
                          >
                            Electors
                          </th>
                          <th
                            className="py-1 pr-2 text-right font-semibold"
                            scope="col"
                          >
                            {gazette.cands[0]}
                          </th>
                          <th
                            className="py-1 text-right font-semibold"
                            scope="col"
                          >
                            {gazette.cands[1]}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {gazette.rows.map((row) => (
                          <tr className="border-el-rule border-b" key={row[0]}>
                            <td className="py-1 pr-2">{row[0]}</td>
                            <td className="py-1 pr-2">{row[1]}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              {fmt(row[2])}
                            </td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              {fmt(row[3])}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {fmt(row[4])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                {e.divs && code && (
                  <StationTable
                    ballots={e.id === "2016r"}
                    divisions={eventDivisions(data, e.id, code)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </Section>
    </>
  );
}
