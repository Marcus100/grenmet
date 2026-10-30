import "./globals.css";

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
    default: "Barrels Bookings",
    template: "%s | Barrels Bookings",
  },
  description:
    "Online appointment booking for Grenada businesses, by Barrels Grenada.",
  // Skeleton only: nothing is indexed until the public booking pages ship.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inter.variable} lang="en">
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
