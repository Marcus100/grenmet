"use client";
import {
  ArrowRightIcon,
  HeadphonesIcon,
  type LucideIcon,
  RadarIcon,
  SatelliteDishIcon,
  VideoIcon,
  WavesIcon,
  WindIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState } from "react";
import { NOTE_KINDS, type TabNotes } from "@/components/home/tab-notes";
import { RelatedLinkAnchor } from "@/components/related-link-anchor";
import type { MediaEmbed } from "@/lib/media-embed";
import { cn } from "@/lib/utils";

/** One playable CMS live post, already checked against the host allowlist. */
export interface MediaItem {
  embed: MediaEmbed;
  id: string;
  /** Preformatted on the server so the client never formats dates. */
  posted: string | null;
  text: string | null;
  title: string;
}

/** A short notice for a tab with nothing to play or show yet: one line, not a tall box. */
const EMPTY_NOTICE =
  "rounded-gm-card border border-gm-border bg-gm-navy px-4 py-3 text-body-sm leading-body-sm";

type TabKey = "satellite" | "radar" | "wind" | "seas" | "audio" | "video";
interface TabDef {
  href: string;
  Icon: LucideIcon;
  key: TabKey;
  label: string;
  /** Imagery tabs: FastAPI data, shown here once its feed is connected. */
  pending?: string;
}

const TABS: [TabDef, ...TabDef[]] = [
  {
    key: "satellite",
    label: "Satellite",
    Icon: SatelliteDishIcon,
    href: "/weather/satellite",
    pending: "Satellite imagery will appear here once its feed is connected.",
  },
  {
    key: "radar",
    label: "Radar",
    Icon: RadarIcon,
    href: "/weather/radar",
    pending: "Radar imagery will appear here once its feed is connected.",
  },
  {
    key: "wind",
    label: "Wind",
    Icon: WindIcon,
    href: "/weather/conditions",
    pending: "Wind across Grenada will appear here once its feed is connected.",
  },
  {
    key: "seas",
    label: "Seas",
    Icon: WavesIcon,
    href: "/marine/sea-conditions",
    pending: "Sea conditions will appear here once their feed is connected.",
  },
  {
    key: "audio",
    label: "Audio",
    Icon: HeadphonesIcon,
    href: "/weather/audio",
  },
  { key: "video", label: "Video", Icon: VideoIcon, href: "/weather/video" },
];

/**
 * The big Weather now panel: six tabs that swap the panel in place, each
 * with a link to its full page. Imagery is FastAPI data; Audio and Video
 * play CMS live posts. Nothing loads from YouTube, Facebook or SoundCloud
 * until the reader opens that tab.
 */
export function WeatherNowPanel({
  audio,
  notes = {},
  video,
}: {
  audio: MediaItem[];
  notes?: TabNotes;
  video: MediaItem[];
}) {
  const [tab, setTab] = useState<TabKey>("satellite");
  const [selected, setSelected] = useState<string | null>(null);
  const baseId = useId();
  const active = TABS.find((item) => item.key === tab) ?? TABS[0];
  const items = { audio, video }[tab as "audio" | "video"] ?? [];
  const current = items.find((item) => item.id === selected) ?? items[0];
  const note = (NOTE_KINDS as readonly string[]).includes(tab)
    ? notes[tab as (typeof NOTE_KINDS)[number]]
    : undefined;

  return (
    <div className="flex flex-col overflow-hidden rounded-gm-card border border-gm-border bg-gm-navy text-gm-text-inverse">
      <div
        aria-label="Weather now"
        className="grid grid-cols-6 gap-0.5 p-1 sm:flex sm:gap-1 sm:p-2"
        role="tablist"
      >
        {TABS.map(({ key, label, Icon }) => (
          <button
            aria-controls={`${baseId}-panel`}
            aria-selected={tab === key}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1.5 font-semibold text-caption leading-caption hover:bg-gm-text-inverse/10 sm:flex-row sm:gap-1.5 sm:whitespace-nowrap sm:px-3 sm:py-2 sm:text-body sm:leading-body",
              tab === key &&
                "bg-gm-text-inverse/15 ring-2 ring-gm-lime ring-inset"
            )}
            id={`${baseId}-${key}`}
            key={key}
            onClick={() => {
              setTab(key);
              setSelected(null);
            }}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`${baseId}-${tab}`}
        className="flex flex-col gap-3 bg-gm-navy-raised p-3"
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        {active.pending && <p className={EMPTY_NOTICE}>{active.pending}</p>}

        {!(active.pending || current) && (
          <p className={EMPTY_NOTICE}>
            No {tab === "video" ? "videos" : "audio"} posted yet.
          </p>
        )}

        {!active.pending && current && (
          <>
            <iframe
              allow="encrypted-media; picture-in-picture; fullscreen"
              className={cn(
                "w-full rounded-gm-card bg-gm-navy",
                tab === "video" ? "aspect-video" : "h-40"
              )}
              key={current.id}
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              src={current.embed.src}
              title={current.title}
            />
            <div className="flex flex-col gap-1 px-1">
              <p className="font-bold text-body-base leading-body-base">
                {current.title}
                {current.posted && (
                  <span className="font-mono font-normal text-body-sm text-gm-text-inverse/80 leading-body-sm">
                    {" "}
                    · {current.posted}
                  </span>
                )}
              </p>
              {current.text && (
                <p className="text-body leading-body">{current.text}</p>
              )}
              <a
                className="w-fit text-body-sm text-gm-lime leading-body-sm underline"
                href={current.embed.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open on {current.embed.provider}
              </a>
            </div>
            {items.length > 1 && (
              <ul
                aria-label={tab === "video" ? "More videos" : "More audio"}
                className="flex flex-col border-gm-text-inverse/15 border-t"
              >
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      aria-current={item.id === current.id}
                      className={cn(
                        "flex w-full items-baseline justify-between gap-3 px-1 py-2 text-left text-body leading-body hover:bg-gm-text-inverse/10",
                        item.id === current.id && "font-bold"
                      )}
                      onClick={() => setSelected(item.id)}
                      type="button"
                    >
                      {item.title}
                      {item.posted && (
                        <span className="font-mono text-body-sm text-gm-text-inverse/80 leading-body-sm">
                          {item.posted}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {note && (
          <div className="flex flex-col gap-1 px-1">
            <p className="font-bold text-body-base leading-body-base">
              {note.title}
              {note.posted && (
                <span className="font-mono font-normal text-body-sm text-gm-text-inverse/80 leading-body-sm">
                  {" "}
                  · {note.posted}
                </span>
              )}
            </p>
            <p className="text-body leading-body">{note.text}</p>
            {note.link && (
              <p className="text-body leading-body [&_a]:text-gm-lime">
                <RelatedLinkAnchor link={note.link} />
              </p>
            )}
          </div>
        )}

        <Link
          className="flex w-fit items-center gap-1 px-1 font-semibold text-body text-gm-lime leading-body hover:underline"
          href={active.href as Route}
        >
          Open the full {active.label.toLowerCase()} page
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
