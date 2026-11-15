import "./globals.css";
import { PublicEnvScript } from "@barrelsgd/ui/components/public-env-script";

import { SkipLink } from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { env } from "@/env";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for canonical links; unset means relative links only.
  ...(env.NEXT_PUBLIC_SITE_URL
    ? { metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL) }
    : {}),
  title: {
    default: "Barrels Bookings",
    template: "%s | Barrels Bookings",
  },
  description:
    "Online appointment booking for Grenada businesses, by Barrels Grenada.",
  openGraph: {
    siteName: "Barrels Bookings",
    locale: "en_GB",
    type: "website",
  },
  twitter: { card: "summary" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inter.variable} lang="en">
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <PublicEnvScript />
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
