import "./globals.css";
import { PublicEnvScript } from "@barrelsgd/ui/components/public-env-script";

import { SkipLink } from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Your Barrels account",
    template: "%s | Barrels account",
  },
  description: "Manage your Barrels account, by Barrels Grenada.",
  // A personal page for each signed-in person: never indexed.
  robots: { index: false, follow: false },
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
