import glob from "fast-glob";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import { Layout } from "@/components/Layout";
import type { Section } from "@/components/SectionProvider";

import "@/styles/tailwind.css";

const PAGE_PATH_REGEX = /(^|\/)page\.mdx$/;

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
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pages = await glob("**/*.mdx", { cwd: "src/app" });
  const allSectionsEntries = (await Promise.all(
    pages.map(async (filename) => [
      `/${filename.replace(PAGE_PATH_REGEX, "")}`,
      (await import(`./${filename}`)).sections,
    ])
  )) as [string, Section[]][];
  const allSections = Object.fromEntries(allSectionsEntries);

  return (
    <html
      className={`${inter.variable} h-full`}
      lang="en"
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body className="flex min-h-full bg-white antialiased">
        <Providers>
          <div className="w-full">
            <Layout allSections={allSections}>{children}</Layout>
          </div>
        </Providers>
      </body>
    </html>
  );
}
