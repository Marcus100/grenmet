import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import type { Metadata } from "next";
import { Inter, Noto_Sans } from "next/font/google";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { APP_LABEL, signInEnabled } from "@/lib/auth-config";
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

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = localFont({
  src: "./fonts/source-serif-4-latin.woff2",
  variable: "--font-source-serif",
  display: "swap",
  weight: "200 900",
  style: "normal",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: {
    default: "Grenada Signal — Know what going on.",
    template: "%s | Grenada Signal",
  },
  robots: { index: false, follow: false },
  description:
    "Clear signal through the noise: what happened, why it matters, who is affected, and what to do next. Grenada news, weather, and verification in 5 minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${inter.variable} ${sourceSerif.variable} ${notoSans.variable}`}
      lang="en"
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <PostHogProvider app="signal">
          <SkipLink />
          <SiteHeader accountLabel={signInEnabled() ? APP_LABEL : undefined} />
          <main className="outline-none" id={MAIN_CONTENT_ID} tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </PostHogProvider>
      </body>
    </html>
  );
}
