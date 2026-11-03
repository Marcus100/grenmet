"use client";

import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

// The Sheet (base-ui dialog) and its links are fetched on the first tap, so
// they stay out of the first-load JavaScript of every page.
const MobileNavSheet = dynamic(
  () => import("@/components/mobile-nav-sheet").then((m) => m.MobileNavSheet),
  { ssr: false }
);

/** Mobile menu trigger. The panel mounts once opened and then stays mounted so its close transition and focus return work. */
export function MobileNavToggle() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open menu"
        className="text-gaa-navy hover:bg-secondary inline-flex size-9 items-center justify-center rounded-md lg:hidden"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <Menu className="size-5" />
      </button>
      {mounted ? (
        <MobileNavSheet
          onOpenChange={setOpen}
          open={open}
          returnFocusRef={triggerRef}
        />
      ) : null}
    </>
  );
}
