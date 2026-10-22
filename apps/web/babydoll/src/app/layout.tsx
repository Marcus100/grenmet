import type { Metadata, Viewport } from "next";
import { Italiana, Montserrat } from "next/font/google";
import type { ReactNode } from "react";
import { BookBar } from "@/components/book-bar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BUSINESS, SITE_URL } from "@/data/site";
import { siteBookingLink } from "@/lib/book-link";
import "./globals.css";

// Primary brand face is Adorn Story (licensed). Italiana stands in until the
// client supplies the web font; Montserrat is the brand's secondary face.
const italiana = Italiana({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-italiana",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BUSINESS.name} — Lashes, brows and skin in Grenada`,
    template: `%s — ${BUSINESS.name}`,
  },
  description:
    "Lash extensions, sculpted brows and custom facials in St. George's, Grenada. By appointment only.",
  openGraph: {
    siteName: BUSINESS.name,
    type: "website",
    images: [{ url: "/logo.jpg", width: 400, height: 400 }],
  },
  icons: { icon: "/logo.jpg" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#121011" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${italiana.variable} ${montserrat.variable}`} lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader booking={siteBookingLink()} />
        <main id="main">{children}</main>
        <SiteFooter />
        <BookBar booking={siteBookingLink()} />
      </body>
    </html>
  );
}
