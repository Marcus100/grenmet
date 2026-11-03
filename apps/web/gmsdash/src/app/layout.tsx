import "./globals.css";

import { SkipLink } from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";

// The brand font: --brand-font-sans resolves to --font-noto-sans, so without
// this load every device fell back to its own system font.
const notoSans = Noto_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-noto-sans",
});

export const metadata: Metadata = {
  title: {
    default: "GMS Dashboard",
    template: "%s | GMS Dashboard",
  },
  description:
    "Raw model guidance for Grenada, from the Grenada Meteorological Service.",
  // Customer service behind sign-in: keep the shell out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={notoSans.variable} lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
