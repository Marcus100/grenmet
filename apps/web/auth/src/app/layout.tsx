import { PostHogProvider } from "@grenmet/ui/components/posthog-provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Grenmet Auth",
  description: "Shared sign-in and session management for Grenmet apps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={inter.variable} lang="en" style={{ colorScheme: "light" }}>
      <body>
        <PostHogProvider
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
