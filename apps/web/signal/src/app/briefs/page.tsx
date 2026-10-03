import Link from "next/link";
import { EmptyState, PageIntro } from "@/components/editorial";
import { getBriefs } from "@/lib/content";
import { formatLongDate } from "@/lib/format";
export const metadata = { title: "Daily Signal" };
export default function BriefsPage() {
  const briefs = getBriefs();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <PageIntro eyebrow="The daily briefing" title="Daily Signal">
        <p>
          The essentials in one sitting. A little context for the day ahead.
        </p>
      </PageIntro>
      {briefs.length ? (
        <div className="divide-y divide-signal-rule">
          {briefs.map((brief) => (
            <article
              className="grid gap-4 border-signal-rule border-t py-8 md:grid-cols-3"
              key={brief.date}
            >
              <p className="text-base">
                <time dateTime={brief.date}>{formatLongDate(brief.date)}</time>
                <span className="mt-2 block text-signal-muted text-sm">
                  {brief.reviewStatus === "editorial-preview"
                    ? "Editorial preview"
                    : "Sample edition"}
                </span>
              </p>
              <div className="md:col-span-2">
                <h2 className="font-semibold font-serif text-3xl leading-tight">
                  <Link
                    className="hover:text-signal-green hover:underline"
                    href={`/today/${brief.date}`}
                  >
                    {brief.title}
                  </Link>
                </h2>
                <p className="mt-3 text-lg leading-relaxed">{brief.dek}</p>
                <p className="mt-4 text-signal-muted text-sm">
                  {brief.presenter}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="The first edition is still to come.">
          When an edition is available, you’ll find it here.
        </EmptyState>
      )}
    </div>
  );
}
