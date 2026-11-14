import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { env } from "@/env";
import "@/styles/app.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.PRINTIX_SITE_URL),
  title: "Printix Scanner",
  description: "Scan Printix event tickets at the gate.",
  applicationName: "Printix Scanner",
  appleWebApp: {
    capable: true,
    title: "Printix",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // A staff tool: nothing here is for search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d0c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`h-full antialiased ${inter.variable}`} lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
