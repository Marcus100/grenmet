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
    size: "text-[15px]",
  },
  {
    label: "Facebook",
    abbr: "f",
    href: "https://facebook.com",
    size: "text-[18px]",
  },
  {
    label: "Instagram",
    abbr: "ig",
    href: "https://instagram.com",
    size: "text-[12px]",
  },
  {
    label: "YouTube",
    abbr: "yt",
    href: "https://youtube.com",
    size: "text-[12px]",
  },
  {
    label: "LinkedIn",
    abbr: "in",
    href: "https://linkedin.com",
    size: "text-[13px]",
  },
];

const LEGAL_LINKS = [
  { label: "Sitemap", href: "/sitemap" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Privacy", href: "/privacy" },
  { label: "Accessibility", href: "/accessibility" },
];

const DIVIDER = <div className="h-px w-full bg-[#d0d5dd]" />;

export function Footer() {
  return (
    <footer className="flex flex-col bg-white">
      {DIVIDER}

      {/* Links */}
      <div className="flex flex-col gap-[4px] px-[24px] py-[8px]">
        {LINK_ROWS.map((row) => (
          <div
            className="flex gap-[16px] py-[6px]"
            key={row.map((l) => l.label).join()}
          >
            {row.map((link) => (
              <a
                className="flex-1 text-[#101828] text-[19px] underline"
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
      <div className="flex gap-[12px] px-[24px] py-[28px]">
        {SOCIAL.map((s) => (
          <a
            aria-label={s.label}
            className={`flex size-[44px] items-center justify-center rounded-[22px] bg-[#1a2a6b] font-semibold text-white ${s.size}`}
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
      <div className="flex flex-col gap-[10px] px-[24px] py-[28px]">
        <Image
          alt="Grenada Meteorological Service"
          height={43}
          src="/gmslogos/logo-primary-navy.png"
          width={180}
        />
        <p className="font-semibold text-[#101828] text-[13px]">
          Grenada Airports Authority
        </p>
        <p className="text-[#71717b] text-[12px]">
          Grenada Meteorological Service
        </p>
      </div>

      {DIVIDER}

      {/* Legal links */}
      <div className="flex gap-[20px] px-[24px] py-[20px]">
        {LEGAL_LINKS.map((link) => (
          <a
            className="shrink-0 text-[#71717b] text-[12px] underline"
            href={link.href}
            key={link.label}
          >
            {link.label}
          </a>
        ))}
      </div>

      {DIVIDER}

      {/* Copyright */}
      <div className="px-[24px] pt-[20px] pb-[28px]">
        <p className="text-[#71717b] text-[11px]">
          Copyright &copy; Grenada Airports Authority {new Date().getFullYear()}
          , Grenada Meteorological Service
        </p>
      </div>
    </footer>
  );
}
