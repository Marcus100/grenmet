import Image from "next/image";

const links = [
  { label: "Forecasts", href: "/forecasts" },
  { label: "Warnings", href: "/warnings" },
  { label: "Marine", href: "/marine" },
  { label: "Aviation", href: "/aviation" },
  { label: "About GMS", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const Footer = () => (
  <footer className="border-gm-border border-t text-muted-foreground">
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            alt="Grenada Meteorological Service"
            className=""
            height={40}
            src="/gmslogos/logo-primary-navy.png"
            width={180}
          />
        </div>

        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.label}>
                <a
                  className="text-sm transition-colors hover:text-gm-navy"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-8 border-gm-border border-t pt-6">
        <p className="text-xs">
          &copy; {new Date().getFullYear()} Grenada Meteorological Service. All
          rights reserved.
        </p>
      </div>
    </div>
  </footer>
);
