import {
  MAIN_CONTENT_ID,
  SkipLink,
} from "@barrelsgd/ui/components/ui/skip-link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** The public alert hub's chrome. Public pages never read cookies (edge cache). */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 outline-none"
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
