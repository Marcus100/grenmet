import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Noto_Sans } from "next/font/google";
import { env } from "@/lib/env";

// The brand font: --brand-font-sans resolves to --font-noto-sans, so without
// this load every device fell back to its own system font.
const notoSans = Noto_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-noto-sans",
});

export const metadata: Metadata = {
  description:
    "Official weather alerts for Grenada, Carriacou and Petite Martinique, issued by the Grenada Meteorological Service.",
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Grenada weather alerts | Grenada Meteorological Service",
    template: "%s | Grenada weather alerts",
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  width: "device-width",
};

/**
 * Document shell only. The public pages add their header and footer in
 * `(public)/layout.tsx`; the staff warning desk has its own in `desk/layout.tsx`.
 * Nothing here reads cookies or headers, so public pages stay edge-cacheable.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`gm-site ${notoSans.variable}`} lang="en">
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
