import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Grenada Signal — Know what going on.",
    template: "%s | Grenada Signal",
  },
  description:
    "Clear signal through the noise: what happened, why it matters, who is affected, and what to do next. Grenada news, weather, and verification in 5 minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${inter.variable} ${sourceSerif.variable}`}
      lang="en"
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
