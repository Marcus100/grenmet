import {
  DemoBanner,
  SiteBottomNav,
  SiteFooter,
  SiteHeader,
} from "@/components/site/site-chrome";
import { getViewer } from "@/data/discovery";

/**
 * Listings depend on "now" (tonight, this weekend), so re-render at most
 * every five minutes rather than freezing them at build time.
 */
export const revalidate = 300;

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();

  return (
    <>
      <DemoBanner />
      <SiteHeader viewer={viewer} />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 md:pb-10">
        {children}
      </main>
      <SiteFooter />
      <SiteBottomNav />
    </>
  );
}
