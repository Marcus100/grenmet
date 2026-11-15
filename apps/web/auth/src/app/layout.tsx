import { PublicEnvScript } from "@barrelsgd/ui/components/public-env-script";
import { SkipLink } from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { env } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

// Barrels platform typeface, the same as the account app (docs/design/account.md).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // Staff-only: keep it out of search engines.
  robots: { index: false, follow: false },
  title: "Barrels sign-in",
  description: "Sign in to your Barrels account and the apps that use it.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes sets the theme class before hydration.
    <html className={inter.variable} lang="en" suppressHydrationWarning>
      <body>
        <PublicEnvScript />
        <SkipLink />
        <Providers
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
