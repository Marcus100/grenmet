import "./globals.css";

import { SkipLink } from "@barrelsgd/ui/components/ui/skip-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Barrels admin",
    template: "%s | Barrels admin",
  },
  description: "Barrels Grenada control plane. Staff only.",
  // Staff-only: keep it out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
