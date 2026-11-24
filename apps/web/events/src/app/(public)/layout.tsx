import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import { BUY_BAR_SPACE_CLASS } from "@/components/discovery/buy-bar-space";
import {
  SiteBottomNav,
  SiteFooter,
  SiteHeader,
} from "@/components/site/site-chrome";
import { getViewer } from "@/data/viewer";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();

  return (
    <PostHogProvider app="events" privacyHref="/privacy">
      <SiteHeader viewer={viewer} />
      {/* The wrapper gives the footer room above a fixed phone buy bar. */}
      <div className={BUY_BAR_SPACE_CLASS}>
        <main className="max-md:standalone:pb-24 mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6">
          {children}
        </main>
        <SiteFooter />
      </div>
      <SiteBottomNav />
    </PostHogProvider>
  );
}
