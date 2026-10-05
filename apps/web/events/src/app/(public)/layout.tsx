import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
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
    <PostHogProvider app="events">
      <SiteHeader viewer={viewer} />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 md:pb-10">
        {children}
      </main>
      <SiteFooter />
      <SiteBottomNav />
    </PostHogProvider>
  );
}
