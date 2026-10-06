import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, Inter, Noto_Sans } from "next/font/google";

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
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
