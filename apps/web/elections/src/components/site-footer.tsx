import Link from "next/link";

const MARKS = [
  [
    "†",
    "A contemporaneous report that matches the official record wherever it can be checked.",
  ],
  ["✱", "Not yet verified against an official record."],
  ["✱✱", "The official copy is unclear or conflicts with other sources."],
] as const;

/** Standing provenance note and the meaning of the verification marks. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-el-rule border-t">
      <div className="mx-auto max-w-[1240px] space-y-4 px-4 py-8 text-el-muted text-sm leading-relaxed sm:px-6">
        <p>
          Elections Grenada is an independent Barrels Grenada project, built
          from public records: Parliamentary Elections Office reports,
          referendum certificates and voter lists (counts only), the Government
          Gazette, ElectionPassport (1951–2008, secondary) and census
          enumeration districts for the map. Boundaries are illustrative.
        </p>
        <dl className="space-y-1">
          {MARKS.map(([mark, meaning]) => (
            <div className="flex gap-3" key={mark}>
              <dt className="w-6 shrink-0 font-bold text-el-ink">{mark}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <p>
          <Link className="underline underline-offset-2" href="/sources">
            Sources and discrepancy register
          </Link>
        </p>
      </div>
    </footer>
  );
}
