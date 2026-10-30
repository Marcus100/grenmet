import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import {
  MAIN_CONTENT_ID,
  SkipLink,
} from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { MotionProvider } from "@/components/motion-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { calendarFrom, electionStatus } from "@/data/election-2026";
import { campaign } from "@/data/load";
import "./globals.css";
import { env } from "@/lib/env";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

/** The masthead status and the homepage lead follow today's date in Grenada. */
export const revalidate = 3600;

export const metadata: Metadata = {
  // Absolute base for share-preview links; set per environment at build time.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Elections Grenada: understand the election",
    template: "%s · Elections Grenada",
  },
  description:
    "Learn how Grenada’s elections work through sourced explanations, historical results, local records and guided statistical tools.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const status = electionStatus(calendarFrom(campaign), new Date());

  return (
    <html className={`${inter.variable} ${sourceSerif.variable}`} lang="en-GB">
      <body className="bg-background text-foreground flex min-h-screen flex-col font-sans text-lg leading-relaxed">
        <PostHogProvider app="elections">
          <SkipLink />

          <MotionProvider>
            <SiteHeader status={status} />
            <main
              className="flex-1 outline-none"
              id={MAIN_CONTENT_ID}
              tabIndex={-1}
            >
              {children}
            </main>
            <SiteFooter />
          </MotionProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
