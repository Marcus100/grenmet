import {
  ArrowRightIcon,
  RadarIcon,
  SatelliteDishIcon,
  UmbrellaIcon,
} from "lucide-react";
import Link from "next/link";
import { HomeSection } from "@/components/home/home-section";
import { fetchHomeContent, isSectionHidden } from "@/lib/cms";

const LAYERS = [
  { href: "/weather/satellite", title: "Satellite", Icon: SatelliteDishIcon },
  { href: "/weather/radar", title: "Radar", Icon: RadarIcon },
  { href: "/weather/rainfall", title: "Rainfall", Icon: UmbrellaIcon },
] as const;

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Imagery layer links beside the duty forecaster's note. The note comes from
 * the CMS while it is current; otherwise the issued forecast summary stands
 * in. Imagery itself is real data and will come from FastAPI.
 */
export async function WeatherNow({
  forecasterNote,
}: {
  forecasterNote: string;
}) {
  if (await isSectionHidden("weather-now")) return null;
  const { weatherNow } = await fetchHomeContent();
  const note = weatherNow?.note;

  return (
    <HomeSection
      kicker="Live"
      link={{ href: "/weather/map", label: "Open interactive map" }}
      title="Weather now"
      tone="surface"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-gm-card bg-gm-navy text-gm-text-inverse">
          <div className="flex gap-1 overflow-x-auto p-2">
            {LAYERS.map(({ href, title, Icon }) => (
              <Link
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 font-semibold text-body leading-body hover:bg-gm-text-inverse/10"
                href={href}
                key={href}
              >
                <Icon aria-hidden="true" className="size-4" />
                {title}
              </Link>
            ))}
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
