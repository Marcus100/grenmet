import type { Metadata } from "next";
import { Inter, Manrope, Noto_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

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

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default:
      "Grenada Airports Authority — Gateway to the Spice of the Caribbean",
    template: "%s | Grenada Airports Authority",
  },
  description:
    "Flight information, travel guidance and services for Maurice Bishop International Airport (GND) and Lauriston Airport, Carriacou (CRU) — connecting you to Grenada and beyond.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${inter.variable} ${manrope.variable} ${notoSans.variable}`}
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
