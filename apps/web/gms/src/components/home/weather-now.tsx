import { ArrowRightIcon } from "lucide-react";
import { HomeSection } from "@/components/home/home-section";
import { NOTE_KINDS, type TabNotes } from "@/components/home/tab-notes";
import {
  type MediaItem,
  WeatherNowPanel,
} from "@/components/home/weather-now-panel";
import { RelatedLinkAnchor } from "@/components/related-link-anchor";
import { clock12 } from "@/lib/clock";
import type { RelatedLink } from "@/lib/cms";
import {
  fetchHomeContent,
  isSectionHidden,
  type LivePost,
  sectionWords,
} from "@/lib/cms";
import { mediaEmbed } from "@/lib/media-embed";

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  hour: "2-digit",
  minute: "2-digit",
});

/** A quick text update under the duty forecaster's note. */
/** The link to show under a live post: its main link, else the first. */
function leadLink(post: LivePost): RelatedLink | null {
  const links = post.relatedLinks ?? [];
  return links.find((link) => link.isMain) ?? links[0] ?? null;
}

function UpdateItem({ post }: { post: LivePost }) {
  const link = leadLink(post);
  return (
    <li className="flex flex-col gap-1 border-gm-border border-t pt-3">
      <p className="flex flex-wrap items-baseline gap-x-2 font-bold text-body text-gm-heading leading-body">
        {post.title}
        {post.publishedAt && (
          <time
            className="font-normal text-body-sm text-gm-text-secondary leading-body-sm"
            dateTime={post.publishedAt}
          >
            {clock12(TIME.format(new Date(post.publishedAt)))}
          </time>
        )}
      </p>
      {post.text && <p className="text-body leading-body">{post.text}</p>}
      {link && (
        <p className="text-body leading-body">
          <RelatedLinkAnchor link={link} />
        </p>
      )}
    </li>
  );
}

/** Video or audio posts whose links pass the allowlist, ready to play. */
function mediaItems(posts: LivePost[], kind: "video" | "audio"): MediaItem[] {
  return posts.flatMap((post) => {
    const embed = post.kind === kind ? mediaEmbed(kind, post.mediaUrl) : null;
    return embed
      ? [
          {
            id: post.id,
            title: post.title,
            text: post.text,
            posted: post.publishedAt
              ? clock12(TIME.format(new Date(post.publishedAt)))
              : null,
            embed,
          },
        ]
      : [];
  });
}

/**
 * The Weather now panel (imagery tabs for FastAPI data; Audio and Video tabs
 * that play CMS live posts in place) beside a blog column: the duty
 * forecaster's note and quick updates, all CMS. The column never shows
 * issued weather data; with no current note it says so.
 */
export async function WeatherNow() {
  if (await isSectionHidden("weather-now")) return null;
  const { weatherNow, livePosts, settings } = await fetchHomeContent();
  const updates = livePosts.posts.filter((post) => post.kind === "update");
  // The newest post for each imagery tab shows as a note under that tab.
  const notes: TabNotes = {};
  for (const kind of NOTE_KINDS) {
    const post = livePosts.posts.find((item) => item.kind === kind);
    if (post?.text)
      notes[kind] = {
        link: leadLink(post),
        title: post.title,
        text: post.text,
        posted: post.publishedAt
          ? clock12(TIME.format(new Date(post.publishedAt)))
          : null,
      };
  }
  const note = weatherNow?.note;
  // The note's main related link (its CAP alert, when it has one), else the first.
  const noteLink =
    note?.relatedLinks?.find((link) => link.isMain) ??
    note?.relatedLinks?.[0] ??
    null;
  const words = sectionWords(settings, "weather-now", {
    kicker: "Live",
    title: "Weather now",
  });

  return (
    <HomeSection
      {...words}
      link={{ href: "/weather/map", label: "Open interactive map" }}
      tone="surface"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WeatherNowPanel
          audio={mediaItems(livePosts.posts, "audio")}
          notes={notes}
          video={mediaItems(livePosts.posts, "video")}
        />
        <div className="flex flex-col gap-3 border-gm-sky border-l-3 pl-4">
          <p className="font-bold text-gm-text-muted text-label uppercase leading-label tracking-wider">
            From the duty forecaster
            {note?.postedAt && (
              <span className="font-normal normal-case tracking-normal">
                {" "}
                · {clock12(TIME.format(new Date(note.postedAt)))}
              </span>
            )}
          </p>
          <p className="text-body-base leading-body-base">
            {note?.text ?? "No note from the duty forecaster right now."}
          </p>
          {noteLink ? (
            <p className="text-body leading-body">
              <RelatedLinkAnchor link={noteLink} />
            </p>
          ) : (
            note?.alertUrl && (
              <a
                className="flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
                href={note.alertUrl}
              >
                Read the alert
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </a>
            )
          )}
          {updates.length > 0 && (
            <section aria-label="Live from GMS" className="mt-2">
              <h3 className="mb-1 font-bold text-gm-text-muted text-label uppercase leading-label tracking-wider">
                Live from GMS
              </h3>
              <ul className="flex flex-col gap-3">
                {updates.map((post) => (
                  <UpdateItem key={post.id} post={post} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </HomeSection>
  );
}
