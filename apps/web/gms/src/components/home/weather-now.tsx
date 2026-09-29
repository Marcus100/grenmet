import {
  ArrowRightIcon,
  RadarIcon,
  SatelliteDishIcon,
  UmbrellaIcon,
  ZapIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HomeSection } from "@/components/home/home-section";
import { fetchHomeContent, isSectionHidden } from "@/lib/cms";

const LAYER_ICONS = {
  satellite: SatelliteDishIcon,
  radar: RadarIcon,
  rainfall: UmbrellaIcon,
  lightning: ZapIcon,
} as const;

const DEFAULT_LAYERS = [
  { href: "/weather/satellite", title: "Satellite", layer: "satellite" },
  { href: "/weather/radar", title: "Radar", layer: "radar" },
  { href: "/weather/rainfall", title: "Rainfall", layer: "rainfall" },
] as const;

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Live imagery beside the duty forecaster's note. The note comes from the
 * CMS while it is current; otherwise the issued forecast summary stands in.
 * Imagery cards are chosen by editors; without any, the layer links show.
 */
export async function WeatherNow({
  forecasterNote,
}: {
  forecasterNote: string;
}) {
  if (await isSectionHidden("weather-now")) return null;
  const { weatherNow } = await fetchHomeContent();
  const note = weatherNow?.note;
  const imagery = weatherNow?.imagery ?? [];

  return (
    <HomeSection
      kicker="Live"
      link={{ href: "/weather/map", label: "Open interactive map" }}
      title="Weather now"
      tone="surface"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {imagery.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {imagery.map((card) => {
              const Icon =
                LAYER_ICONS[card.layer as keyof typeof LAYER_ICONS] ??
                SatelliteDishIcon;
              return (
                <li key={`${card.layer}-${card.title}`}>
                  <Link
                    className="group flex h-full flex-col overflow-hidden rounded-gm-card bg-gm-navy text-gm-text-inverse"
                    href={card.href}
                  >
                    <span className="relative flex aspect-16/10 items-center justify-center bg-gm-navy-raised">
                      {card.imageUrl ? (
                        <Image
                          alt={`${card.title}, latest image`}
                          className="object-cover"
                          fill
                          sizes="(min-width: 1024px) 30vw, 100vw"
                          src={card.imageUrl}
                          unoptimized
                        />
                      ) : (
                        <Icon aria-hidden="true" className="size-10" />
                      )}
                    </span>
                    <span className="flex items-center justify-between gap-2 p-3">
                      <span className="flex items-center gap-2 font-semibold text-body leading-body group-hover:underline">
                        <Icon aria-hidden="true" className="size-4" />
                        {card.title}
                      </span>
                      {card.credit && (
                        <span className="text-caption text-gm-text-inverse/80 leading-caption">
                          {card.credit}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-gm-card bg-gm-navy text-gm-text-inverse">
            <div className="flex gap-1 overflow-x-auto p-2">
              {DEFAULT_LAYERS.map(({ href, title, layer }) => {
                const Icon = LAYER_ICONS[layer];
                return (
                  <Link
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 font-semibold text-body leading-body hover:bg-gm-text-inverse/10"
                    href={href}
                    key={href}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {title}
                  </Link>
                );
              })}
            </div>
            <div className="flex aspect-16/10 flex-col items-center justify-center gap-2 bg-gm-navy-raised p-6 text-center">
              <p className="font-bold font-gm-display text-heading-md uppercase leading-heading-md tracking-wide">
                Interactive map coming soon
              </p>
              <p className="max-w-sm text-body text-gm-text-inverse/80 leading-body">
                Satellite, radar, rainfall, lightning and wind on one map of the
                southern Windwards. Until then, open each layer above.
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 border-gm-sky border-l-3 pl-4">
          <p className="font-bold text-gm-text-muted text-label uppercase leading-label tracking-wider">
            From the duty forecaster
            {note?.postedAt && (
              <span className="font-normal normal-case tracking-normal">
                {" "}
                · {TIME.format(new Date(note.postedAt))}
              </span>
            )}
          </p>
          <p className="text-body-base leading-body-base">
            {note?.text ?? forecasterNote}
          </p>
          {note?.alertUrl && (
            <a
              className="flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
              href={note.alertUrl}
            >
              Read the alert
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </a>
          )}
          <Link
            className="flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
            href="/weather/synopsis"
          >
            Read the weather synopsis
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </HomeSection>
  );
}
