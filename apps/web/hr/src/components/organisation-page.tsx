import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const PAGE_CLASS = "mx-auto flex w-full max-w-3xl flex-col gap-8 p-6";

/** The page frame every organisation page shares. */
export function OrganisationPage({ children }: { children: ReactNode }) {
  return (
    <main className={PAGE_CLASS} id="main-content">
      {children}
    </main>
  );
}

/** Back to the organisation picker. Wording depends on how many organisations the person has. */
export function AllOrganisationsLink({ count }: { count: number }) {
  return (
    <nav aria-label="Organisations" className="text-sm">
      <Link
        className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        href={"/" as Route}
      >
        {count > 1 ? "All organisations" : "Your organisations"}
      </Link>
    </nav>
  );
}

/**
 * The only wording for a slug outside the person's list. It never says whether
 * the organisation exists, so a missing and a forbidden organisation look alike.
 */
export function NotGrantedOrganisation({ count }: { count: number }) {
  return (
    <>
      <AllOrganisationsLink count={count} />
      <section aria-labelledby="no-org-heading" className="space-y-2">
        <h1
          className="text-2xl font-semibold tracking-tight"
          id="no-org-heading"
        >
          No access to this organisation
        </h1>
        <p className="text-muted-foreground">
          Your Barrels HR access does not include this organisation. Choose one
          of your organisations instead.
        </p>
      </section>
    </>
  );
}
