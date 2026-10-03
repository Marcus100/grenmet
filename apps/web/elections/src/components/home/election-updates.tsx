import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Flag } from "@/components/flag";
import { FlagStripe } from "@/components/flag-stripe";
import { Photo } from "@/components/photo";
import type { CoverageUpdate } from "@/data/coverage";
import type { PhotoId } from "@/data/photos";
import type { CampaignEvent } from "@/data/types";
import { formatIsoDate } from "@/lib/format";

interface Update {
  at: string;
  date: string;
  /** An editors' pick, which leads the feed whatever its date. */
  featured?: boolean;
  flag?: CampaignEvent["flag"];
  /** A drawn graphic for the lead story, used in place of its photo. */
  graphic?: ReactNode;
  /** The article page, for coverage posts. */
  href?: string;
  note?: string;
  photo?: PhotoId;
  /** Source id, for campaign events (posts list theirs on their own page). */
  src?: string;
  text: string;
  title?: string;
}

/**
 * Coverage posts and campaign events in one feed, newest first, laid out like
 * a news front: the featured post (else the newest) as the lead story, the
 * rest in a column. Posts link
 * to their article, which carries the sources; events keep theirs on the
 * campaign timeline ("All updates"), so the feed shows no source lines. An event is left out when a
 * post on the same day cites its source, so the post stands for it.
 */
export function ElectionUpdates({
  coverage,
  events,
  limit = 5,
  hidePhoto,
  graphics,
}: {
  coverage: CoverageUpdate[];
  events: CampaignEvent[];
  limit?: number;
  /** A photo already on the page, so the lead story doesn't repeat it. */
  hidePhoto?: PhotoId;
  /** Graphics a post can name, drawn by the page (they need its data). */
  graphics?: Partial<Record<NonNullable<CoverageUpdate["graphic"]>, ReactNode>>;
}) {
  const covered = new Set(
    coverage.flatMap((p) =>
      p.sources.flatMap((s) =>
        "id" in s ? [`${p.at.slice(0, 10)}|${s.id}`] : []
      )
    )
  );
  const updates: Update[] = [
    ...coverage.map((p) => ({
      at: p.at,
      date: p.at.slice(0, 10),
      title: p.title,
      text: p.dek,
      href: `/updates/${p.slug}`,
      ...(p.featured ? { featured: true } : {}),
      ...(p.photo && p.photo !== hidePhoto ? { photo: p.photo } : {}),
      ...(p.graphic && graphics?.[p.graphic]
        ? { graphic: graphics[p.graphic] }
        : {}),
    })),
    ...events
      .filter((e) => !(e.future || covered.has(`${e.date}|${e.src}`)))
      .map((e) => ({
        at: `${e.date}T00:00:00-04:00`,
        date: e.date,
        text: e.text,
        flag: e.flag,
        ...(e.note ? { note: e.note } : {}),
        src: e.src,
      })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    // An editors' pick leads, as on a news front; the rest stay newest first.
    .sort(
      (a: Update, b: Update) =>
        Number(Boolean(b.featured)) - Number(Boolean(a.featured))
    )
    .slice(0, limit);

  const [lead, ...rest] = updates;
  if (!lead) return null;

  return (
    <div
      className={cn(
        "grid items-start gap-8 lg:gap-10",
        rest.length > 0 && "lg:grid-cols-2"
      )}
    >
      <UpdateStory lead update={lead} />
      {rest.length > 0 && (
        <ol className="divide-y divide-el-rule border-el-rule border-t lg:border-t-0">
          {rest.map((u) => (
            <li className="py-6 lg:first:pt-0" key={`${u.date}${u.text}`}>
              <UpdateStory update={u} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * One update as a news story: kicker, headline, summary and date. The lead
 * sits on a green-tinted panel under the flag stripe, with its graphic or
 * photo, a larger serif headline and its summary; the others show the headline alone, as on a news front.
 */
function UpdateStory({
  update: u,
  lead = false,
}: {
  update: Update;
  lead?: boolean;
}) {
  return (
    <article className={cn("min-w-0", lead && "bg-el-flag-green-tint")}>
      {lead && <FlagStripe />}
      {lead && u.graphic && (
        <div className="overflow-x-auto bg-el-paper px-3 py-4 sm:px-6">
          {u.graphic}
        </div>
      )}
      {lead && !u.graphic && u.photo && (
        <Photo
          className="[&_figcaption]:px-6 sm:[&_figcaption]:px-8"
          id={u.photo}
          ratio="aspect-[2/1]"
          sizes="(max-width: 1024px) 100vw, 600px"
        />
      )}
      <div className={cn(lead && "p-6 sm:p-8")}>
        <p className="mb-3 font-semibold text-el-ink-2 text-sm uppercase tracking-[0.07em]">
          {u.title ? "Election 2026" : "Campaign"}
        </p>
        {u.title ? (
          <>
            <h3
              className={cn(
                "font-bold leading-tight tracking-tight",
                lead
                  ? "font-serif text-3xl sm:text-4xl"
                  : "font-sans text-xl lg:text-2xl"
              )}
            >
              {u.href ? (
                <Link
                  className="hover:underline hover:decoration-2 hover:underline-offset-4"
                  href={u.href}
                >
                  {u.title}
                </Link>
              ) : (
                u.title
              )}
            </h3>
            {lead && (
              <p className="mt-4 text-el-ink-2 text-lg leading-relaxed">
                {u.text}
              </p>
            )}
          </>
        ) : (
          <p
            className={cn(
              "font-semibold leading-snug",
              lead ? "font-serif text-2xl sm:text-3xl" : "text-xl"
            )}
          >
            {u.text}
            <Flag note={u.note} status={u.flag ?? null} />
          </p>
        )}
        <time
          className="mt-4 block font-semibold text-base text-el-muted tabular-nums"
          dateTime={u.date}
        >
          {formatIsoDate(u.date)}
        </time>
      </div>
    </article>
  );
}
