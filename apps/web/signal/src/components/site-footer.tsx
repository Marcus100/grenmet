import Link from "next/link";
import { NAV_LINKS } from "@/lib/nav";
export function SiteFooter() {
  return (
    <footer className="mt-12 border-signal-ink border-t bg-secondary">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-2">
        <div>
          <Link className="font-semibold font-serif text-3xl" href="/">
            Grenada <span className="text-signal-green">Signal.</span>
          </Link>
          <p className="mt-4 max-w-md text-base leading-relaxed">
            Rooted in Grenada. Open to the world. News, entertainment and useful
            discoveries for wherever life finds you.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-x-6"
        >
          {[
            ...NAV_LINKS,
            { label: "Daily Signal", href: "/briefs" },
            { label: "About Signal", href: "/about" },
            { label: "Editorial approach", href: "/about#editorial" },
          ].map((link) => (
            <Link
              className="inline-flex min-h-11 items-center text-base hover:underline"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-sm">© {new Date().getFullYear()} Grenada Signal</p>
        <p className="text-sm">Free to read. No account needed.</p>
      </div>
    </footer>
  );
}
