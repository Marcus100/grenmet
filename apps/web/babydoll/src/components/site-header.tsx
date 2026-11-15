"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NewTabNote } from "@/components/new-tab-note";
import { BUSINESS, NAV } from "@/data/site";
import type { CtaLink } from "@/lib/book-link";

export function SiteHeader({ booking }: { booking: CtaLink }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const primaryNav = useRef<HTMLElement>(null);
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Escape closes the open phone menu; focus goes back to its button when the
  // focus was inside the menu, so keyboard users are not left in a closed list.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const focusWasInMenu = primaryNav.current?.contains(
        document.activeElement
      );
      setOpen(false);
      if (focusWasInMenu) menuToggle.current?.focus();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

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
          ref={menuToggle}
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
          ref={primaryNav}
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
        <a className="btn btn-solid head-book" {...booking}>
          Book now
          <NewTabNote />
        </a>
      </div>
    </header>
  );
}
