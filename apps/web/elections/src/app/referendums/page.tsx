import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "@/components/flag";
import { FlatMap } from "@/components/map/flat-map";
import { Provenance } from "@/components/results/provenance";
import { PageHead, Section } from "@/components/section";
import {
  eventDivisions,
  eventNational,
  eventResult,
  eventSlug,
  eventSource,
} from "@/data/events";
import { data, geo, results } from "@/data/load";
import { CODES, constituencyHref, constituencyName } from "@/data/model";
import { partyColor } from "@/data/parties";
import type { CandidateRow } from "@/data/types";
import { yesFill } from "@/lib/colors";
import { fmt, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Referendums",
  description:
    "Grenada’s 2016 referendum on seven constitutional bills and the 2018 referendum on the Caribbean Court of Justice, down to the polling division.",
};

function yesShare(rows: CandidateRow[]): number {
  const yes = rows.find((r) => r[1] === "YES")?.[2] ?? 0;
  const no = rows.find((r) => r[1] === "NO")?.[2] ?? 0;
  return yes + no ? yes / (yes + no) : 0;
}

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

function ReferendumMap({
  id,
  label,
}: {
  id: "2016r" | "2018r";
  label: string;
}) {
  const divisions = Object.fromEntries(
    eventDivisions(data, id).map((d) => [d.division, d])
  );
  return (
    <figure>
      <FlatMap
        geo={geo}
        label={label}
        level="div"
        regions={Object.keys(geo.divisions).map((code) => {
          const d = divisions[code];
          return {
            code,
            fill: d ? yesFill(yesShare(d.c)) : "var(--el-paper-2)",
            title: d
              ? `${code}${d.places[0] ? ` · ${d.places[0]}` : ""}: Yes ${pct(yesShare(d.c))}`
              : `${code}: no readable result`,
          };
        })}
      />
      <figcaption className="mt-2 text-xs">
        <span className="flex items-center gap-2">
          <span>No +40</span>
          <span
            className="h-2.5 flex-1"
            style={{
              background: `linear-gradient(90deg, ${yesFill(0.1)}, ${yesFill(0.5)}, ${yesFill(0.9)})`,
            }}
          />
          <span>Yes +40</span>
        </span>
        <span className="mt-1 block text-el-muted">
          Yes as a share of Yes and No votes, by polling division. Grey: no
          readable result. Boundaries are illustrative.
        </span>
      </figcaption>
    </figure>
  );
}

function ConstituencyTable({ id }: { id: "2016r" | "2018r" }) {
  const rows = CODES.map((code) => ({ code, r: eventResult(data, id, code) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-el-ink border-b text-left">
            {["Constituency", "Yes", "No", "Yes share", "Turnout"].map(
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
          {rows
            .sort(
              (a, b) =>
                (b.r ? yesShare(b.r.c) : -1) - (a.r ? yesShare(a.r.c) : -1)
            )
            .map(({ code, r }) => (
              <tr className="border-el-rule border-b" key={code}>
                <td className="py-2 pr-3">
                  <Link
                    className="hover:underline"
                    href={constituencyHref(results, code)}
                  >
                    {constituencyName(results, code)}
                  </Link>
                </td>
                {r ? (
                  <>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmt(r.c.find((x) => x[1] === "YES")?.[2])}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmt(r.c.find((x) => x[1] === "NO")?.[2])}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      {pct(yesShare(r.c))}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.reg && r.cast ? pct(r.cast / r.reg) : "–"}
                    </td>
                  </>
                ) : (
                  <td className="py-2 pr-3 text-el-muted" colSpan={4}>
                    Gazette page damaged; no readable result
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReferendumsPage() {
  const r16 = data.referendum["2016"];
  const r18 = data.referendum["2018"];
  const n18 = eventNational(data, "2018r");
  const turnout = [
    { label: "2013 election", id: "2013" },
    { label: "2016 referendum", id: "2016r" },
    { label: "2018 election", id: "2018" },
    { label: "2018 referendum", id: "2018r" },
    { label: "2022 election", id: "2022" },
  ].map((t) => ({ ...t, turnout: eventNational(data, t.id).turnout ?? 0 }));

  return (
    <>
      <PageHead
        deck="Some parts of Grenada’s Constitution can only be changed by a two-thirds majority at a referendum. In 2016 voters were asked about seven bills at once, and in 2018 about the Caribbean Court of Justice. Every bill was rejected."
        eyebrow="Referendums · 2016 and 2018"
        learning="referendum"
        title="Two votes to change the Constitution, two clear Nos"
      />

      <Section
        id="2016"
        intro={`Turnout was ${pct(r16.turnout)}: ${fmt(r16.voted)} of ${fmt(r16.registered)} registered voters (PEO certificate). No bill came close to the two-thirds it needed.`}
        more={{
          href: `/elections/${eventSlug("2016r")}`,
          label: "Every station",
        }}
        title="24 November 2016 · seven bills"
      >
        <ul className="space-y-3">
          {r16.bills.map(([title, yes, no, invalid]) => {
            const s = yes / (yes + no);
            return (
              <li
                className="grid gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1fr)_50%]"
                key={title}
              >
                <b className="font-semibold">{title}</b>
                <div>
                  <div
                    aria-label={`Yes ${pct(s)}, No ${pct(1 - s)}`}
                    className="relative flex h-6 text-xs"
                    role="img"
                  >
                    <span
                      className="flex items-center pl-2 text-white"
                      style={{
                        width: `${s * 100}%`,
                        background: partyColor("YES"),
                      }}
                    >
                      Yes {pct(s, 0)}
                    </span>
                    <span
                      className="flex flex-1 items-center justify-end pr-2 text-white"
                      style={{ background: partyColor("NO") }}
                    >
                      No {pct(1 - s, 0)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute -inset-y-1 w-0.5 bg-el-ink"
                      style={{ left: "66.7%" }}
                      title="Two-thirds needed"
                    />
                  </div>
                  <small className="text-el-muted tabular-nums">
                    {fmt(yes)} yes · {fmt(no)} no · {fmt(invalid)} invalid or
                    blank · needed 66.7%
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-el-muted text-xs">
          Results by bill: {r16.billsSource}
          <Flag
            note="The PEO certificates give the seven bills combined; per-bill figures are from a secondary source."
            status="unverified"
          />
          . {r16.totalsSource}.
        </p>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ReferendumMap
            id="2016r"
            label="2016 referendum: Yes share by polling division"
          />
          <div>
            <h3 className={LABEL}>By constituency, Yes share highest first</h3>
            <p className="mt-1 text-el-muted text-xs">{r16.note}</p>
            <div className="mt-2">
              <ConstituencyTable id="2016r" />
            </div>
          </div>
        </div>
        <Provenance official text={eventSource(data, "2016r").text} />
      </Section>

      <Section
        id="2018"
        intro="Should the Caribbean Court of Justice replace the Privy Council in London as Grenada’s final court of appeal?"
        more={{
          href: `/elections/${eventSlug("2018r")}`,
          label: "Every readable station",
        }}
        title="6 November 2018 · Caribbean Court of Justice"
      >
        <div
          aria-label={`Yes ${pct(r18.yes / (r18.yes + r18.no))}, No ${pct(r18.no / (r18.yes + r18.no))}`}
          className="flex h-10 max-w-2xl text-sm"
          role="img"
        >
          <span
            className="flex items-center pl-3 font-semibold text-white"
            style={{
              width: `${(r18.yes / (r18.yes + r18.no)) * 100}%`,
              background: partyColor("YES"),
            }}
          >
            Yes {pct(r18.yes / (r18.yes + r18.no))}
          </span>
          <span
            className="flex flex-1 items-center justify-end pr-3 font-semibold text-white"
            style={{ background: partyColor("NO") }}
          >
            No {pct(r18.no / (r18.yes + r18.no))}
          </span>
        </div>
        <p className="mt-2 text-el-ink-2 text-sm tabular-nums">
          Yes {fmt(r18.yes)} · No {fmt(r18.no)} · invalid {fmt(r18.invalid)} ·
          turnout {pct(n18.turnout)} of {fmt(r18.registered)} registered.
        </p>
        <p className="mt-3 max-w-[70ch] border-el-rule border-l-2 pl-3 text-el-ink-2 text-sm">
          {r18.note}
        </p>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ReferendumMap
            id="2018r"
            label="2018 referendum: Yes share by polling division"
          />
          <div>
            <h3 className={LABEL}>By constituency, Yes share highest first</h3>
            <div className="mt-2">
              <ConstituencyTable id="2018r" />
            </div>
          </div>
        </div>
        <Provenance official text={r18.source} />
      </Section>

      <Section
        id="turnout"
        intro="Turnout at the national votes from 2013 to 2022."
        title="Referendums draw far fewer voters than elections"
      >
        <ul className="max-w-2xl space-y-2">
          {turnout.map((t) => (
            <li
              className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 text-sm"
              key={t.id}
            >
              <span>{t.label}</span>
              <span className="h-4 bg-el-paper-2">
                <span
                  className="block h-full"
                  style={{
                    width: `${t.turnout * 100}%`,
                    background: t.id.endsWith("r")
                      ? "var(--el-ink-2)"
                      : "var(--el-seq-1)",
                  }}
                />
              </span>
              <span className="text-right tabular-nums">{pct(t.turnout)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
