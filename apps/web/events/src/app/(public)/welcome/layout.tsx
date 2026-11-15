import type { Metadata } from "next";

// Post-sign-up status page for one person: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
