import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Header } from "@/components/header";
import { MotionProvider } from "@/components/motion-provider";
import { fetchActiveAlerts } from "@/lib/cap";
import { env } from "@/lib/env";
import "./globals.css";
import {
  MAIN_CONTENT_ID,
  SkipLink,
} from "@barrelsgd/ui/components/ui/skip-link";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Grenada Meteorological Service",
  description:
    "Official weather forecasts, alerts, and bulletins for Grenada, Carriacou & Petite Martinique.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Deduplicated with the weather layout's call via React cache in lib/cap.
  const alerts = await fetchActiveAlerts();

  return (
    <html
      className={notoSans.variable}
      lang="en"
      style={{ colorScheme: "light" }}
    >
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <SkipLink />
        <PostHogProvider
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          <MotionProvider>
            <Header alerts={alerts} />
            <main
              className="flex-1 outline-none"
              id={MAIN_CONTENT_ID}
              tabIndex={-1}
            >
              {children}
            </main>
            <Footer />
          </MotionProvider>
          <GoogleAnalytics
            environment={env.NEXT_PUBLIC_SENTRY_ENVIRONMENT}
            measurementId={env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          />
        </PostHogProvider>
      </body>
    </html>
  );
}
