import { Logo } from "@barrelsgd/gms/components/logo";
import { CookieSettingsButton } from "@barrelsgd/ui/components/posthog-provider";
import Link from "next/link";
import {
  siFacebook,
  siInstagram,
  siWhatsapp,
  siX,
  siYoutube,
} from "simple-icons";

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

/*
 * Social accounts. PLACEHOLDER URLs: these are generic platform home pages
 * until GMS supplies its own account links. Replace each `href` here (one place)
 * when the owner sends them. Icons are simple-icons marks (CC0), drawn as
 * inline SVG from their path data. simple-icons has no LinkedIn mark, so that
 * network keeps its name as text.
 */
const SOCIAL: readonly { href: string; icon?: string; label: string }[] = [
  { label: "X", href: "https://x.com", icon: siX.path },
  { label: "Facebook", href: "https://facebook.com", icon: siFacebook.path },
  { label: "Instagram", href: "https://instagram.com", icon: siInstagram.path },
  { label: "YouTube", href: "https://youtube.com", icon: siYoutube.path },
  { label: "LinkedIn", href: "https://linkedin.com" },
  { label: "WhatsApp", href: "https://whatsapp.com", icon: siWhatsapp.path },
];

/** A brand mark as inline SVG; decorative, the link's aria-label names it. */
function BrandIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  );
}

const LEGAL_LINKS = [
  { label: "Sitemap", href: "/sitemap" },
  { label: "Website help", href: "/help" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "Privacy", href: "/privacy" },
  { label: "Disclaimer", href: "/disclaimer" },
] as const;

const LINK = "hover:text-gm-text-inverse hover:underline";

/**
 * Bold sky footer: navy, brand block and four link columns. The navy band is
 * full window width; its rows align to the page column (`max-w-6xl`, as the
 * header does).
 */
export function Footer() {
  const copyright = `Copyright © Grenada Airports Authority ${new Date().getFullYear()}, Grenada Meteorological Service`;

  return (
    <footer className="bg-gm-navy text-body text-gm-text-inverse/80 leading-body lg:text-body-base lg:leading-body-base">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 pt-10 pb-8 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] xl:px-8">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="dark w-fit"
            href="/"
          >
            <Logo className="h-10 w-auto" variant="primary" />
          </Link>
          <p className="text-body-sm leading-body-sm lg:text-body lg:leading-body max-w-sm">
            <b className="text-gm-text-inverse">
              Grenada Meteorological Service
            </b>
            <br />A department of the Grenada Airports Authority. Maurice Bishop
            International Airport, St. George.
          </p>
          <ul aria-label="GMS on social media" className="flex flex-wrap gap-2">
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a
                  aria-label={`GMS on ${s.label}`}
                  className="border-gm-border text-caption leading-caption hover:bg-gm-text-inverse/10 flex h-9 min-w-9 items-center justify-center gap-2 rounded-full border px-2.5 font-semibold"
                  href={s.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {s.icon ? <BrandIcon path={s.icon} /> : s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {COLUMNS.map((column) => (
          <nav aria-label={column.heading} key={column.heading}>
            <h2 className="text-gm-text-inverse text-label leading-label lg:text-caption lg:leading-caption mb-3 font-bold tracking-wider uppercase">
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
        <div className="text-body-sm leading-body-sm lg:text-body lg:leading-body mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 sm:px-6 xl:px-8">
          <p className="text-body-sm leading-body-sm lg:text-body lg:leading-body">
            {copyright}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:ml-auto">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link className={LINK} href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
            {/* Cookie choices live here, not in a floating button that covers content on phones. */}
            <li>
              <CookieSettingsButton className={`${LINK} cursor-pointer`} />
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
