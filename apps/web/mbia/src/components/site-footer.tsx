import { Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { NAV_GROUPS } from "@/lib/nav";

const FOOTER_GROUPS = NAV_GROUPS.filter((g) =>
  ["Travel Guide", "At the Airport", "Business", "Corporate"].includes(g.label)
);

export function SiteFooter() {
  return (
    <footer className="bg-gaa-navy-ink text-white">
      <div className="h-1 bg-gaa-gold" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-6 lg:px-8">
        <div className="lg:col-span-2">
          <Image
            alt="Grenada Airports Authority"
            className="h-14 w-auto"
            height={56}
            src="/images/gaa-logo-white.png"
            width={110}
          />
          <p className="mt-4 max-w-xs text-sm text-white/70 leading-relaxed">
            Gateway to the Spice of the Caribbean — connecting you to Grenada,
            Carriacou &amp; Petite Martinique and beyond.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-white/80">
            <li className="flex items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Maurice Bishop International Airport, St. George&rsquo;s, Grenada
            </li>
            <li>
              <a
                className="flex items-center gap-2.5 transition-colors hover:text-white"
                href="tel:+14734444555"
              >
                <Phone aria-hidden="true" className="size-4 shrink-0" />
                +1 (473) 444-4555
              </a>
            </li>
            <li>
              <a
                className="flex items-center gap-2.5 transition-colors hover:text-white"
                href="mailto:gaa@gaa.gd"
              >
                <Mail aria-hidden="true" className="size-4 shrink-0" />
                gaa@gaa.gd
              </a>
            </li>
          </ul>
        </div>
        {FOOTER_GROUPS.map((group) => (
          <nav aria-label={group.label} key={group.label}>
            <Link
              className="font-bold font-display text-sm text-white uppercase tracking-wider hover:text-gaa-gold"
              href={group.href}
            >
              {group.label}
            </Link>
            <ul className="mt-4 space-y-2.5">
              {group.links.slice(0, 7).map((link) => (
                <li key={link.href}>
                  <Link
                    className="text-sm text-white/70 transition-colors hover:text-white"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-white/10 border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-white/60 text-xs sm:flex-row lg:px-8">
          <p>
            © {new Date().getFullYear()} Grenada Airports Authority. All rights
            reserved.
          </p>
          <div className="flex items-center gap-5">
            <Link
              className="transition-colors hover:text-white"
              href="/flights"
            >
              Flight Information
            </Link>
            <Link
              className="transition-colors hover:text-white"
              href="/corporate/accessibility"
            >
              Accessibility
            </Link>
            <Link
              className="transition-colors hover:text-white"
              href="/contact"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
