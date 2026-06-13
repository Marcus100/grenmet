import { Facebook, Instagram, MessageCircle, Youtube } from "lucide-react";
import Link from "next/link";
import { NAV_LINKS } from "@/lib/nav";

const SOCIALS = [
  { label: "WhatsApp", href: "#", Icon: MessageCircle },
  { label: "Facebook", href: "#", Icon: Facebook },
  { label: "Instagram", href: "#", Icon: Instagram },
  { label: "YouTube", href: "#", Icon: Youtube },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-signal-rule border-t bg-secondary/40">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <p className="font-bold font-serif text-lg">
              Grenada <span className="text-signal-green">Signal</span>
            </p>
            <p className="mt-2 text-signal-muted text-sm">
              Clear signal through the noise: what happened, why it matters, who
              is affected, and what to do next.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                className="text-foreground/80 text-sm hover:text-signal-green"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex gap-3">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                aria-label={label}
                className="inline-flex size-9 items-center justify-center rounded-full border border-signal-rule text-foreground/70 hover:border-signal-green hover:text-signal-green"
                href={href}
                key={label}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-signal-rule border-t pt-6 text-signal-muted text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Grenada Signal · A Signal Caribbean bureau.</p>
          <p className="flex gap-4">
            <Link className="hover:text-signal-green" href="#">
              Terms
            </Link>
            <Link className="hover:text-signal-green" href="#">
              Privacy Policy
            </Link>
            <Link className="hover:text-signal-green" href="#">
              Editorial Standards
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
