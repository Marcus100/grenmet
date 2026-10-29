import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { env } from "@/env";
import "@/styles/tailwind.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const monaSans = localFont({
  src: "../fonts/Mona-Sans.var.woff2",
  display: "swap",
  variable: "--font-mona-sans",
  weight: "200 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.COMMIT_SITE_URL),
  title: "Commit — How Barrels Grenada builds its platform",
  description:
    "Technical notes from Barrels Grenada: what each release changes, why, and how it was built.",
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: { siteName: "Commit", type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={cn("h-full antialiased", inter.variable, monaSans.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-white dark:bg-gray-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
