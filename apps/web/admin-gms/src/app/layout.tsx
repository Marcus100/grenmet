import { Inter } from "next/font/google";
import "./globals.css";

import { PostHogProvider } from "@grenmet/ui/components/posthog-provider";
import type { Metadata } from "next";
import { ApiProvider } from "@/components/providers/ApiProvider";
import { SidebarProvider } from "@/context/SidebarContext";
import { env } from "@/lib/env";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
  title: {
    default: "Grenada Meteorological Service",
    template: "%s | Grenada Meteorological Service",
  },
  description: "Your weather dashboard description",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

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
          <QueryProvider>
            <ApiProvider>
              <SidebarProvider>{children}</SidebarProvider>
            </ApiProvider>
          </QueryProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
