import Image from "next/image";

const LINK_ROWS = [
  [
    { label: "About GMS", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  [
    { label: "GMS Weather app", href: "/weather-app" },
    { label: "Glossary", href: "/glossary" },
  ],
  [
    { label: "Events", href: "/events" },
    { label: "Website help", href: "/help" },
  ],
  [{ label: "News and media", href: "/news" }],
];

const SOCIAL = [
  {
    label: "X / Twitter",
    abbr: "X",
    href: "https://x.com",
    size: "text-body",
  },
  {
    label: "Facebook",
    abbr: "f",
    href: "https://facebook.com",
    size: "text-heading-sm",
  },
  {
    label: "Instagram",
    abbr: "ig",
    href: "https://instagram.com",
    size: "text-caption",
  },
  {
    label: "YouTube",
    abbr: "yt",
    href: "https://youtube.com",
    size: "text-caption",
  },
  {
    label: "LinkedIn",
    abbr: "in",
    href: "https://linkedin.com",
    size: "text-body-sm",
  },
];

const LEGAL_LINKS = [
  { label: "Sitemap", href: "/sitemap" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Privacy", href: "/privacy" },
  { label: "Accessibility", href: "/accessibility" },
];

const FLAT_LINKS = LINK_ROWS.flat();

const ABOUT_SERVICES_COPY =
  "We provide weather, climate, marine and aviation services for Grenada, Carriacou and Petite Martinique — for everyone who lives, works, farms and sails here.";

const DIVIDER = <div className="h-px w-full bg-gm-border" />;
const MOBILE_DIVIDER = <div className="h-px w-full bg-gm-border lg:hidden" />;

export function Footer() {
  const copyright = `Copyright © Grenada Airports Authority ${new Date().getFullYear()}, Grenada Meteorological Service`;

  return (
    <footer className="flex flex-col bg-background lg:mx-auto lg:max-w-7xl lg:px-8">
      {DIVIDER}

      {/* Links — mobile: stacked pairs */}
      <div className="flex flex-col gap-1 px-6 py-2 lg:hidden">
        {LINK_ROWS.map((row) => (
          <div
            className="flex gap-4 py-1.5"
            key={row.map((l) => l.label).join()}
          >
            {row.map((link) => (
              <a
                className="flex-1 text-gm-text-primary text-heading-sm underline"
                href={link.href}
                key={link.label}
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>

      {/* Links — desktop: description + 3-col grid */}
      <div className="hidden gap-20 pt-14 pb-14 lg:flex">
        <div className="flex w-155 flex-none flex-col gap-6">
          <p className="text-body-base text-gm-text-primary leading-body-base">
            {ABOUT_SERVICES_COPY}
          </p>
          <a
            className="font-bold text-body-base text-gm-blue leading-body-base"
            href="/about"
          >
            About our services
          </a>
        </div>
        <div className="grid flex-1 grid-cols-3 content-start gap-x-8 gap-y-6">
          {FLAT_LINKS.map((link) => (
            <a
              className="text-body-base text-gm-text-primary leading-body-base"
              href={link.href}
              key={link.label}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {MOBILE_DIVIDER}

      {/* Social — mobile */}
      <div className="flex gap-3 px-6 py-7 lg:hidden">
        {SOCIAL.map((s) => (
          <a
            aria-label={s.label}
            className={`flex size-11 items-center justify-center rounded-full bg-gm-navy font-semibold text-gm-text-inverse ${s.size}`}
            href={s.href}
            key={s.label}
            rel="noopener noreferrer"
            target="_blank"
          >
            {s.abbr}
          </a>
        ))}
      </div>

      {/* Social + institutional lockup — desktop, same row */}
      <div className="hidden items-end justify-between py-10 lg:flex">
        <div className="flex gap-3.5">
          {SOCIAL.map((s) => (
            <a
              aria-label={s.label}
              className={`flex size-11.5 items-center justify-center rounded-full bg-gm-navy font-semibold text-gm-text-inverse ${s.size}`}
              href={s.href}
              key={s.label}
              rel="noopener noreferrer"
              target="_blank"
            >
              {s.abbr}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Image
            alt="Grenada Meteorological Service"
            height={46}
            src="/gmslogos/logo-primary-navy.png"
            width={192}
          />
          <p className="font-semibold text-body-sm text-gm-text-primary">
            Grenada Airports Authority
          </p>
        </div>
      </div>

      {MOBILE_DIVIDER}

      {/* Institutional lockup — mobile */}
      <div className="flex flex-col gap-2.5 px-6 py-7 lg:hidden">
        <Image
          alt="Grenada Meteorological Service"
          height={43}
          src="/gmslogos/logo-primary-navy.png"
          width={180}
        />
        <p className="font-semibold text-body-sm text-gm-text-primary">
          Grenada Airports Authority
        </p>
        <p className="text-caption text-gm-text-muted">
          Grenada Meteorological Service
        </p>
      </div>

      {MOBILE_DIVIDER}

      {/* Legal links — mobile */}
      <div className="flex gap-5 px-6 py-5 lg:hidden">
        {LEGAL_LINKS.map((link) => (
          <a
            className="shrink-0 text-caption text-gm-text-muted underline"
            href={link.href}
            key={link.label}
          >
            {link.label}
          </a>
        ))}
      </div>

      {MOBILE_DIVIDER}

      {/* Copyright — mobile */}
      <div className="px-6 pt-5 pb-7 lg:hidden">
        <p className="text-gm-text-muted text-label">{copyright}</p>
      </div>

      {/* Legal links + copyright — desktop, same row */}
      <div className="hidden items-center justify-between border-gm-border border-t py-7 lg:flex">
        <div className="flex gap-8">
          {LEGAL_LINKS.map((link) => (
            <a
              className="shrink-0 text-body-sm text-gm-text-secondary"
              href={link.href}
              key={link.label}
            >
              {link.label}
            </a>
          ))}
        </div>
        <p className="text-body-sm text-gm-text-secondary">{copyright}</p>
      </div>
    </footer>
  );
}
