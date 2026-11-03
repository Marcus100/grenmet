import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, Inter, Noto_Sans } from "next/font/google";
import { env } from "@/env";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for share-preview links; set per environment at build time.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Barrels Events — What's on in Grenada",
    template: "%s | Barrels Events",
  },
  description:
    "Every event in Grenada, Carriacou and Petite Martinique — fetes, meetups, food, sport and culture — plus the groups and people behind them.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${notoSans.variable} ${inter.variable} ${bricolage.variable}`}
      lang="en"
    >
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
