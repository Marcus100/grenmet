import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { PartyDot } from "@/components/party-chip";
import { PageHead, Section } from "@/components/section";
import { personHref } from "@/data/candidates";
import { eventSlug, isOfficial } from "@/data/events";
import { campaign, data, people } from "@/data/load";
import { partyColor, partyInfo } from "@/data/parties";
import { partyRecords, partySlug } from "@/data/parties-history";
import { fmt, pct } from "@/lib/format";

interface Props {
  params: Promise<{ code: string }>;
}

function find(slug: string) {
  return partyRecords(data).find((r) => partySlug(r.code) === slug);
}

export function generateStaticParams() {
  return partyRecords(data)
    .filter((r) => r.code !== "IND")
    .map((r) => ({ code: partySlug(r.code) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = find((await params).code);
  if (!r) return {};
  const name = partyInfo(r.code).name;
  return {
    title: name,
    description: `${name} (${r.code}) at every Grenada general election it contested: seats, votes and candidates.`,
  };
}

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

export default async function PartyPage({ params }: Props) {
  const record = find((await params).code);
  if (!record || record.code === "IND") notFound();
  const { code, years } = record;
  const info = partyInfo(code);
  const seats = years.reduce((a, y) => a + y.seats, 0);
  const events = campaign.events.filter(
    (e) => e.text.includes(code) || e.text.includes(info.name)
  );
  const winners = people()
    .filter((p) => p.races.some((r) => r.party === code && r.won))
    .sort(
      (a, b) =>
        b.races.filter((r) => r.party === code && r.won).length -
        a.races.filter((r) => r.party === code && r.won).length
    )
    .slice(0, 12);

  const W = 560;
  const H = 180;
  const minY = Math.min(...years.map((y) => y.year));
  const maxY = Math.max(...years.map((y) => y.year), minY + 1);
  const x = (yr: number) => 34 + ((yr - minY) / (maxY - minY)) * (W - 54);
  const y = (share: number) => H - 24 - share * (H - 40);

  return (
    <>
      <PageHead
        deck={`Contested ${years.length} general election${years.length === 1 ? "" : "s"}, ${years[0]?.year === years.at(-1)?.year ? years[0]?.year : `${years[0]?.year}–${years.at(-1)?.year}`}, winning ${seats} seat${seats === 1 ? "" : "s"} in all.`}
        eyebrow={`Party · ${code}`}
        title={info.name}
      >
        <p className="mt-3 text-sm">
          <Link className="underline underline-offset-4" href="/parties">
            ← All parties
          </Link>
        </p>
      </PageHead>

      {years.length > 1 && (
        <Section id="share" title="Share of the vote">
          <svg
            aria-label={`${info.name} share of the national vote at each election`}
            className="h-auto w-full max-w-2xl"
            role="img"
            viewBox={`0 0 ${W} ${H}`}
          >
            {[0, 0.25, 0.5].map((v) => (
              <g key={v}>
                <line
                  stroke="var(--el-rule)"
                  x1={34}
                  x2={W - 10}
                  y1={y(v)}
                  y2={y(v)}
                />
                <text
                  className="fill-(--el-muted) text-[10px] max-sm:text-[16px]"
                  x={0}
                  y={y(v) + 3}
                >
                  {v * 100}%
                </text>
              </g>
            ))}
            <polyline
              fill="none"
              points={years.map((p) => `${x(p.year)},${y(p.share)}`).join(" ")}
              stroke={partyColor(code)}
              strokeWidth={2.5}
            />
            {years.map((p) => (
              <g key={p.year}>
                <circle
                  cx={x(p.year)}
                  cy={y(p.share)}
                  fill={partyColor(code)}
                  r={4.5}
                >
                  <title>{`${p.year}: ${pct(p.share)}, ${p.seats} seat${p.seats === 1 ? "" : "s"}`}</title>
                </circle>
                <text
                  className="fill-(--el-muted) text-[10px] max-sm:text-[16px]"
                  textAnchor="middle"
                  x={x(p.year)}
                  y={H - 6}
                >
                  {p.year}
                </text>
              </g>
            ))}
          </svg>
        </Section>
      )}

      <Section id="record" title="Every general election">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-el-ink border-b text-left">
                {["Election", "Candidates", "Seats won", "Votes", "Share"].map(
                  (h, i) => (
                    <th
                      className={`py-2 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}
                      key={h}
                      scope="col"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((p) => (
                <tr className="border-el-rule border-b" key={p.year}>
                  <td className="py-2 pr-3">
                    <Link
                      className="hover:underline"
                      href={`/elections/${eventSlug(String(p.year))}`}
                    >
                      {p.year}
                    </Link>
                    {!isOfficial(String(p.year)) && (
                      <span className="ml-1 text-el-muted text-xs">
                        (secondary source)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {p.candidates} of {p.races}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {p.seats}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmt(p.votes)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {pct(p.share)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {winners.length > 0 && (
        <Section id="members" title={`Elected for the ${code}`}>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {winners.map((p) => {
              const wins = p.races.filter((r) => r.party === code && r.won);
              return (
                <li key={p.key}>
                  <Link
                    className="font-semibold hover:underline"
                    href={personHref(p)}
                  >
                    {p.name}
                  </Link>
                  <span className="text-el-muted">
                    {" "}
                    · {wins.length} win{wins.length === 1 ? "" : "s"} (
                    {wins.map((r) => r.year).join(", ")})
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {events.length > 0 && (
        <Section id="since" title="Since the 2022 election">
          <CampaignTimeline events={events} sources={campaign.sources} />
        </Section>
      )}

      <Section id="colour" title="On this site">
        <p className="text-el-ink-2 text-sm">
          <span className={LABEL}>Colour</span> <PartyDot party={code} />
          The {code} is drawn in its colour on every map and chart, always with
          its name.
        </p>
      </Section>
    </>
  );
}
