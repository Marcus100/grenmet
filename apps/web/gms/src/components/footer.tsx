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

const DIVIDER = <div className="h-px w-full bg-gm-border" />;

export function Footer() {
  return (
    <footer className="flex flex-col bg-background">
      {DIVIDER}

      {/* Links */}
      <div className="flex flex-col gap-1 px-6 py-2">
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

      {DIVIDER}

      {/* Social */}
      <div className="flex gap-3 px-6 py-7">
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

      {DIVIDER}

      {/* Institutional lockup */}
      <div className="flex flex-col gap-2.5 px-6 py-7">
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

      {DIVIDER}

      {/* Legal links */}
      <div className="flex gap-5 px-6 py-5">
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

      {DIVIDER}

      {/* Copyright */}
      <div className="px-6 pt-5 pb-7">
        <p className="text-gm-text-muted text-label">
          Copyright &copy; Grenada Airports Authority {new Date().getFullYear()}
          , Grenada Meteorological Service
        </p>
      </div>
    </footer>
  );
}
