import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { env } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Grenmet Auth",
  description: "Shared sign-in and session management for Grenmet apps.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={inter.variable} lang="en" style={{ colorScheme: "light" }}>
      <body>
        <Providers
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
