import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import type { Metadata } from "next";
import { Inter, Noto_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { fetchActiveAlerts } from "@/lib/cap";
import { env } from "@/lib/env";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Grenada Meteorological Service",
  description:
    "Official weather forecasts, alerts, and bulletins for Grenada, Carriacou & Petite Martinique.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Deduplicated with the weather layout's call via React cache in lib/cap.
  const alerts = await fetchActiveAlerts();

  return (
    <html
      className={`${inter.variable} ${notoSans.variable}`}
      lang="en"
      style={{ colorScheme: "light" }}
    >
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <PostHogProvider
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          <Header alerts={alerts} />
          <main className="flex-1">{children}</main>
          <Footer />
        </PostHogProvider>
      </body>
    </html>
  );
}
