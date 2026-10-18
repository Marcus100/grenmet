import "./globals.css";

import {
  MAIN_CONTENT_ID,
  SkipLink,
} from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="gm-site" lang="en">
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <SkipLink />
        <SiteHeader />
        <main
          className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 outline-none"
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
