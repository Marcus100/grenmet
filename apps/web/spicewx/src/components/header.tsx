"use client";

import { Bars2Icon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useState } from "react";
import { NavDrawer } from "@/components/nav-drawer";

export function Header() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-[72px] items-center justify-between border-[#d0d5dd] border-b bg-white pr-[20px] pl-[24px]">
        <Image
          alt="Grenada Meteorological Service"
          height={36}
          priority
          src="/gmslogos/logo-primary-navy.png"
          width={150}
        />
        <button
          aria-label="Open navigation"
          className="flex size-[44px] items-center justify-center"
          onClick={() => setNavOpen(true)}
          type="button"
        >
          <Bars2Icon className="size-[24px] text-gray-900" />
        </button>
      </header>

      <NavDrawer onClose={() => setNavOpen(false)} open={navOpen} />
    </>
  );
}
