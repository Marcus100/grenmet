import { Logo } from "@barrelsgd/gms/components/logo";
import { CookieSettingsButton } from "@barrelsgd/ui/components/posthog-provider";
import { BellIcon } from "lucide-react";
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
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/1E5eWWgjK8/",
    icon: siFacebook.path,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/spiceweather473",
    icon: siInstagram.path,
  },
  { label: "YouTube", href: "https://youtube.com", icon: siYoutube.path },
  { label: "LinkedIn", href: "https://linkedin.com" },
  {
    label: "WhatsApp",
    href: "https://wa.me/14735345234",
    icon: siWhatsapp.path,
  },
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
      {/* Alerts sign-up and emergency advice open the footer (owner, 1 Nov 2026). */}
      <div className="mx-auto grid max-w-6xl gap-3 px-4 pt-10 sm:px-6 lg:grid-cols-[3fr_2fr] xl:px-8">
        <section
          aria-labelledby="footer-alerts-title"
          className="flex flex-col gap-3 rounded-gm-card bg-gm-navy-panel p-5"
        >
          <div className="flex items-start gap-3">
            <BellIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-gm-lime"
            />
            <div>
              <h2
                className="font-bold text-body-base text-gm-text-inverse leading-body-base"
                id="footer-alerts-title"
              >
                Get official alerts first
              </h2>
              <p className="text-body-sm leading-body-sm">
                We send alerts the moment we issue them, by email or browser
                notifications.
              </p>
            </div>
          </div>
          <Link
            className="flex h-11 w-fit items-center justify-center rounded-md bg-gm-lime px-4 font-bold text-body text-gm-navy leading-body"
            href="/alerts/get-alerts"
          >
            Get alerts
          </Link>
        </section>
        <section
          aria-labelledby="footer-emergency-title"
          className="flex flex-col justify-center gap-1 rounded-gm-card border border-gm-text-inverse/15 p-5 text-body-sm leading-body-sm"
        >
          <h2
            className="font-bold text-body-base text-gm-text-inverse leading-body-base"
            id="footer-emergency-title"
          >
            In an emergency
          </h2>
          <p>
            Call 911. Follow instructions from the National Disaster Management
            Agency (NaDMA) and the police.
          </p>
          <p>
            Local radio carries official warnings if power or internet is down.
          </p>
        </section>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 pt-10 pb-8 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] xl:px-8">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <Link
            aria-label="Grenada Meteorological Service — home"
            className="dark w-fit"
            href="/"
          >
            <Logo className="h-10 w-auto" variant="primary" />
          </Link>
          <p className="max-w-sm text-body-sm leading-body-sm lg:text-body lg:leading-body">
            <b className="text-gm-text-inverse">
              Grenada Meteorological Service
            </b>
            <br />A department of the Grenada Airports Authority. Maurice Bishop
            International Airport, St. George.
          </p>
          <address className="flex flex-col gap-0.5 text-body-sm not-italic leading-body-sm lg:text-body lg:leading-body">
            <a className={LINK} href="tel:+14734444142">
              Main line +1 473 444 4142
            </a>
            <a className={LINK} href="tel:+14734444101,2059">
              Forecast office +1 473 444 4101 ext. 2059
            </a>
            <a className={LINK} href="mailto:meteorology@gaa.gd">
              meteorology@gaa.gd
            </a>
          </address>
          <ul aria-label="GMS on social media" className="flex flex-wrap gap-2">
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a
                  aria-label={`GMS on ${s.label}`}
                  className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-full border border-gm-border px-2.5 font-semibold text-caption leading-caption hover:bg-gm-text-inverse/10"
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
            <h2 className="mb-3 font-bold text-gm-text-inverse text-label uppercase leading-label tracking-wider lg:text-caption lg:leading-caption">
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-body-sm leading-body-sm sm:px-6 lg:text-body lg:leading-body xl:px-8">
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
