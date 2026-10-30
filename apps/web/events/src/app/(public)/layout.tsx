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
    <PostHogProvider app="events" privacyHref="/privacy">
      <SiteHeader viewer={viewer} />
      <main className="max-md:standalone:pb-24 mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6">
        {children}
      </main>
      <SiteFooter />
      <SiteBottomNav />
    </PostHogProvider>
  );
}
