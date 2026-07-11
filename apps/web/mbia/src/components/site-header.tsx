"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@grenmet/ui/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@grenmet/ui/components/ui/sheet";
import { Mail, Menu, Phone, PlaneTakeoff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { NAV_GROUPS } from "@/lib/nav";

function UtilityBar() {
  return (
    <div className="hidden bg-gaa-navy-deep text-white/85 md:block">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4 text-xs lg:px-8">
        <div className="flex items-center gap-5">
          <a
            className="flex items-center gap-1.5 transition-colors hover:text-white"
            href="tel:+14734444555"
          >
            <Phone aria-hidden="true" className="size-3" />
            +1 (473) 444-4555
          </a>
          <a
            className="flex items-center gap-1.5 transition-colors hover:text-white"
            href="mailto:gaa@gaa.gd"
          >
            <Mail aria-hidden="true" className="size-3" />
            gaa@gaa.gd
          </a>
        </div>
        <div className="flex items-center gap-5">
          <Link
            className="transition-colors hover:text-white"
            href="/corporate/careers-opportunities"
          >
            Careers
          </Link>
          <Link className="transition-colors hover:text-white" href="/news">
            News
          </Link>
          <Link className="transition-colors hover:text-white" href="/contact">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}

function DesktopNav() {
  return (
    <NavigationMenu className="hidden lg:block">
      <NavigationMenuList>
        {NAV_GROUPS.map((group) => (
          <NavigationMenuItem key={group.label}>
            <NavigationMenuTrigger className="bg-transparent">
              {group.label}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="grid w-[420px] grid-cols-2 gap-1 p-3">
                <NavigationMenuLink
                  className="col-span-2 rounded-lg bg-gaa-mist p-3 font-display font-semibold text-gaa-navy text-sm hover:bg-gaa-rule"
                  render={<Link href={group.href} />}
                >
                  {group.label} overview →
                </NavigationMenuLink>
                {group.links.map((link) => (
                  <NavigationMenuLink
                    className="rounded-lg p-2.5 text-gaa-ink text-sm hover:bg-gaa-mist hover:text-gaa-navy"
                    key={link.href}
                    render={<Link href={link.href} />}
                  >
                    {link.label}
                  </NavigationMenuLink>
                ))}
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Open menu"
        className="inline-flex size-9 items-center justify-center rounded-md text-gaa-navy hover:bg-secondary lg:hidden"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent className="w-80 overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle className="text-left font-display text-gaa-navy">
            Grenada Airports Authority
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-6 px-4 pb-10">
          <Button
            asChild
            className="bg-gaa-gold text-gaa-navy-ink hover:bg-gaa-gold-deep"
          >
            <Link href="/flights" onClick={() => setOpen(false)}>
              <PlaneTakeoff aria-hidden="true" className="size-4" />
              Flight Information
            </Link>
          </Button>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <Link
                className="mb-2 block font-bold font-display text-gaa-navy text-sm uppercase tracking-wide"
                href={group.href}
                onClick={() => setOpen(false)}
              >
                {group.label}
              </Link>
              <div className="flex flex-col border-gaa-rule border-l">
                {group.links.map((link) => (
                  <Link
                    className="px-3 py-1.5 text-gaa-muted text-sm hover:text-gaa-navy"
                    href={link.href}
                    key={link.href}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link
            className="font-semibold text-gaa-navy text-sm"
            href="/contact"
            onClick={() => setOpen(false)}
          >
            Contact Us
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-gaa-rule border-b bg-white/95 backdrop-blur">
      <UtilityBar />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <Link className="flex shrink-0 items-center" href="/">
          <Image
            alt="Grenada Airports Authority"
            className="h-10 w-auto"
            height={40}
            priority
            src="/images/gaa-logo-blue.png"
            width={78}
          />
          <span className="sr-only">Grenada Airports Authority — home</span>
        </Link>
        <DesktopNav />
        <div className="flex items-center gap-2">
          <Button
            asChild
            className="hidden bg-gaa-gold font-semibold text-gaa-navy-ink hover:bg-gaa-gold-deep sm:inline-flex"
          >
            <Link href="/flights">
              <PlaneTakeoff aria-hidden="true" className="size-4" />
              Flight Info
            </Link>
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
