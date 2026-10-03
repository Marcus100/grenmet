import { PreferencesStoreProvider } from "@barrelsgd/theme/components/preferences-provider";
import { ThemeBootScript } from "@barrelsgd/theme/components/theme-boot";
import { PREFERENCE_DEFAULTS } from "@barrelsgd/theme/lib/preferences-config";
import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import type { Metadata } from "next";
import { Barlow_Condensed, Noto_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { MotionProvider } from "@/components/motion-provider";
import { fetchActiveAlerts } from "@/lib/cap";
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

// Bold sky display face: large numerals and home section headings only.
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

/** The public site follows the device theme until someone picks one. */
const THEME_DEFAULTS = { theme_mode: "system" } as const;

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
    // gm-site scopes the GMS dark palette (packages/gms foundation) to this
    // app; the boot script sets `dark` before paint, hence the warning opt-out.
    <html
      className={`gm-site ${notoSans.variable} ${barlowCondensed.variable}`}
      data-theme-mode={THEME_DEFAULTS.theme_mode}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <ThemeBootScript defaults={THEME_DEFAULTS} />
      </head>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <SkipLink />
        <PostHogProvider app="gms">
          <PreferencesStoreProvider
            contentLayout={PREFERENCE_DEFAULTS.content_layout}
            font={PREFERENCE_DEFAULTS.font}
            navbarStyle={PREFERENCE_DEFAULTS.navbar_style}
            themeMode={THEME_DEFAULTS.theme_mode}
            themePreset={PREFERENCE_DEFAULTS.theme_preset}
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
          </PreferencesStoreProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
