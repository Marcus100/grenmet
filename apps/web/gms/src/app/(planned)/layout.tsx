import { PageTransition } from "@/components/page-transition";
import { SiteBreadcrumbs } from "@/components/site-breadcrumbs";

/**
 * Container for the planned-page placeholders. It mirrors the standing pages'
 * container but sits outside the (pages) group on purpose: (pages) has a
 * loading skeleton, and a Suspense boundary there streams the response before
 * `notFound()` runs, so an unknown URL would answer 200 instead of 404.
 */
export default function PlannedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 xl:px-8">
      <SiteBreadcrumbs />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
