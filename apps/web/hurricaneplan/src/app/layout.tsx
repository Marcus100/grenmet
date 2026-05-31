import { PostHogProvider } from "@grenmet/ui/components/posthog-provider";
import { allHurricanepages } from "content-collections";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import { Layout } from "@/components/Layout";
import type { Section } from "@/components/SectionProvider";
import { env } from "@/lib/env";

import "@/styles/tailwind.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s - Hurricane Plan",
    default: "Hurricane Plan",
  },
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
}: {
  children: React.ReactNode;
}) {
  const allSections: Record<string, Section[]> = Object.fromEntries(
    allHurricanepages.map((page) => {
      const path = page._meta.path.replaceAll("\\", "/");
      const pathname = path === "index" ? "/" : `/${path}`;
      return [pathname, page.sections];
    })
  );

  return (
    <html
      className={`${inter.variable} h-full`}
      lang="en"
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body className="flex min-h-full bg-white antialiased">
        <PostHogProvider
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          <Providers>
            <div className="w-full">
              <Layout allSections={allSections}>{children}</Layout>
            </div>
          </Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}
