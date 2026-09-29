import { Logo } from "@barrelsgd/gms/components/logo";
import Link from "next/link";

const COLUMNS = [
  {
    heading: "Weather",
    links: [
      { label: "Forecasts", href: "/weather" },
      { label: "Radar", href: "/weather/radar" },
      { label: "Satellite", href: "/weather/satellite" },
      { label: "Tropics", href: "/weather/tropics" },
      { label: "Observations", href: "/weather/observations" },
    ],
  },
  {
    heading: "Alerts & marine",
    links: [
      { label: "Alerts in effect", href: "/alerts" },
      { label: "Get alerts", href: "/alerts/get-alerts" },
      { label: "Marine forecast", href: "/marine/forecast" },
      { label: "Tides", href: "/marine/tides" },
      { label: "Marine safety", href: "/marine/safety" },
    ],
  },
  {
    heading: "Climate & services",
    links: [
      { label: "Climate", href: "/climate" },
      { label: "Climate data", href: "/climate/rainfall" },
      { label: "Aviation", href: "/services/aviation" },
      { label: "Agriculture", href: "/services/agriculture" },
      { label: "Events", href: "/services/tourism/events" },
    ],
  },
  {
    heading: "About",
    links: [
      { label: "About GMS", href: "/about" },
      { label: "Contact", href: "/about/contact" },
      { label: "Careers", href: "/about/careers" },
      { label: "For media", href: "/services/media" },
      { label: "GMS Weather app", href: "/app-guide" },
    ],
  },
] as const;

const SOCIAL = [
  { label: "X / Twitter", abbr: "X", href: "https://x.com" },
  { label: "Facebook", abbr: "f", href: "https://facebook.com" },
  { label: "Instagram", abbr: "ig", href: "https://instagram.com" },
  { label: "YouTube", abbr: "yt", href: "https://youtube.com" },
  { label: "LinkedIn", abbr: "in", href: "https://linkedin.com" },
  { label: "WhatsApp", abbr: "wa", href: "https://whatsapp.com" },
] as const;

const LEGAL_LINKS = [
  { label: "Sitemap", href: "/sitemap" },
  { label: "Website help", href: "/help" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "Privacy", href: "/privacy" },
  { label: "Disclaimer", href: "/disclaimer" },
] as const;

const LINK = "hover:text-gm-text-inverse hover:underline";

/** Bold sky footer: navy, brand block and four link columns. */
export function Footer() {
  const copyright = `Copyright © Grenada Airports Authority ${new Date().getFullYear()}, Grenada Meteorological Service`;

  return (
    // pb-20 on phones clears the fixed tab bar.
    <footer className="bg-gm-navy pb-20 text-body text-gm-text-inverse/80 leading-body lg:pb-0">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 pt-10 pb-8 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] xl:px-8">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="dark w-fit"
            href="/"
          >
            <Logo className="h-10 w-auto" variant="primary" />
          </Link>
          <p className="max-w-sm text-body-sm leading-body-sm">
            <b className="text-gm-text-inverse">
              Grenada Meteorological Service
            </b>
            <br />A department of the Grenada Airports Authority. Maurice Bishop
            International Airport, St. George&apos;s. Forecast office open 24
            hours.
          </p>
          <ul aria-label="GMS on social media" className="flex flex-wrap gap-2">
            {SOCIAL.map((s) => (
              <li key={s.href}>
                <a
                  aria-label={s.label}
                  className="flex size-9 items-center justify-center rounded-full border border-gm-text-inverse/30 font-bold text-caption leading-caption hover:bg-gm-text-inverse/10"
                  href={s.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {s.abbr}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {COLUMNS.map((column) => (
          <nav aria-label={column.heading} key={column.heading}>
            <h2 className="mb-3 font-bold text-gm-text-inverse text-label uppercase leading-label tracking-wider">
              {column.heading}
            </h2>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link className={LINK} href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-gm-text-inverse/15 border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-body-sm leading-body-sm sm:px-6 xl:px-8">
          <span>Partners: WMO · ICAO · CMO · CIMH · NHC · NaDMA</span>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:ml-auto">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link className={LINK} href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="w-full text-caption leading-caption">{copyright}</p>
        </div>
      </div>
    </footer>
  );
}
