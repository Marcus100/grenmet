"use client";

import { usePathname } from "next/navigation";

/**
 * Quick opacity fade-in on enter, nothing else. Owner decision of 14 Nov 2026
 * (issue #1408): no exit animation and no `mode="wait"`, so the new page is
 * never held back. This wraps /warnings and /marine/small-craft, which must
 * start showing at once.
 *
 * The fade is CSS (tw-animate-css), not motion: the resting state is fully
 * visible, so server HTML and visitors without JavaScript never see a blank
 * page. The pathname key remounts the wrapper to replay the fade per route.
 * Reduced motion is handled globally in packages/ui app-feel.css.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="animate-in fade-in-0 duration-150" key={pathname}>
      {children}
    </div>
  );
}
