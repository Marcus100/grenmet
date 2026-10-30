import { CookieSettingsButton } from "@barrelsgd/ui/components/posthog-provider";
import Link from "next/link";
import { FlagStripe } from "@/components/flag-stripe";

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
    <footer className="mt-16">
      <FlagStripe />
      <div className="mx-auto max-w-[1240px] space-y-4 px-4 py-8 text-base text-el-muted leading-relaxed sm:px-6">
        <nav
          aria-label="Learning and evidence"
          className="flex flex-wrap gap-4"
        >
          <Link className="underline" href="/learn">
            Learning guides
          </Link>
          <Link className="underline" href="/search">
            Search the site
          </Link>
          <Link className="underline" href="/sources">
            Sources and methods
          </Link>
          <CookieSettingsButton className="cursor-pointer underline" />
        </nav>
        <p>
          Elections Grenada is an independent Barrels Grenada project. It is not
          the Parliamentary Elections Office. Use PEO guidance to confirm your
          registration and polling station.
        </p>
        <details>
          <summary className="cursor-pointer">Evidence marks</summary>
          <dl className="mt-2 space-y-1">
            {MARKS.map(([mark, meaning]) => (
              <div className="flex gap-3" key={mark}>
                <dt className="w-6 shrink-0 font-bold text-el-ink">{mark}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </footer>
  );
}
