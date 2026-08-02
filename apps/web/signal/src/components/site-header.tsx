"use client";

import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@barrelsgd/ui/components/ui/sheet";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Menu, RadioTower } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/nav";

function Wordmark({ className }: { className?: string }) {
  return (
    <Link aria-label="Grenada Signal — home" className={className} href="/">
      <span className="flex items-center gap-2">
        <RadioTower aria-hidden className="size-5 text-signal-green" />
        <span className="font-bold font-serif text-lg tracking-tight">
          Grenada <span className="text-signal-green">Signal</span>
        </span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-signal-rule border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Wordmark />

        <nav className="hidden items-center gap-5 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              className="font-medium text-foreground/80 text-sm transition-colors hover:text-signal-green"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
          <Link className={buttonVariants({ size: "sm" })} href="/#subscribe">
            Subscribe
          </Link>
        </nav>

        <Sheet onOpenChange={setOpen} open={open}>
          <SheetTrigger
            aria-label="Open menu"
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground/80 hover:bg-secondary md:hidden"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent className="w-72" side="right">
            <SheetHeader>
              <SheetTitle>
                <Wordmark />
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => (
                <Link
                  className="rounded-md px-2 py-2.5 font-medium text-base hover:bg-secondary"
                  href={link.href}
                  key={link.href}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                className={cn(buttonVariants(), "mt-3")}
                href="/#subscribe"
                onClick={() => setOpen(false)}
              >
                Subscribe
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
