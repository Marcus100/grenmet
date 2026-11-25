"use client";

import { SkipLink } from "@barrelsgd/ui/components/ui/skip-link";
import { usePathname } from "next/navigation";

/** Studio business pages draw the admin shell, which brings its own skip link. */
const STUDIO_SHELL = /^\/studio\/[^/]+/u;

/**
 * The page-wide "Skip to content" link. The studio's admin shell
 * (`@barrelsgd/admin-kit`) renders its own, so it steps aside there and
 * keyboard users meet one skip link, not two.
 */
export function RootSkipLink() {
  const pathname = usePathname();
  return STUDIO_SHELL.test(pathname) ? null : <SkipLink />;
}
