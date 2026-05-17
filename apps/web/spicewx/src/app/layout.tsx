import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Grenada Meteorological Service",
  description:
    "Official weather forecasts, alerts, and bulletins for Grenada, Carriacou & Petite Martinique.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inter.variable} lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <header>
          <div className="mx-auto mb-4 max-w-7xl border border-gray-300 px-4 sm:px-6 lg:px-8">
            <h1 className="font-bold text-3xl text-gray-900 tracking-tight">
              Dashboard
            </h1>
          </div>
        </header>
        <main>
          <div>{children}</div>
        </main>
        <Footer />
      </body>
    </html>
  );
}
