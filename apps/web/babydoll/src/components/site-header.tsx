"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BOOKING_URL, BUSINESS, NAV } from "@/data/site";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link aria-label={`${BUSINESS.name} home`} className="brand" href="/">
          <Image alt="" height={42} priority src="/logo.jpg" width={42} />
          <span>{BUSINESS.name}</span>
        </Link>
        <button
          aria-controls="primary-nav"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="menu-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <nav
          aria-label="Main"
          className="primary"
          data-open={open}
          id="primary-nav"
        >
          {NAV.map((item) => (
            <Link
              aria-current={isCurrent(item.href) ? "page" : undefined}
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <a
          className="btn btn-solid head-book"
          href={BOOKING_URL}
          rel="noopener"
          target="_blank"
        >
          Book now
        </a>
      </div>
    </header>
  );
}
