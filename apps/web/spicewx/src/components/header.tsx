"use client";

import { Bars2Icon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useState } from "react";
import { NavDrawer } from "@/components/nav-drawer";

export function Header() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-gm-72 items-center justify-between border-gm-border border-b bg-background pr-gm-20 pl-gm-24">
        <Image
          alt="Grenada Meteorological Service"
          height={36}
          priority
          src="/gmslogos/logo-primary-navy.png"
          width={150}
        />
        <button
          aria-label="Open navigation"
          className="flex size-gm-44 items-center justify-center"
          onClick={() => setNavOpen(true)}
          type="button"
        >
          <Bars2Icon className="size-gm-24 text-gm-text-primary" />
        </button>
      </header>

      <NavDrawer onClose={() => setNavOpen(false)} open={navOpen} />
    </>
  );
}
