import type { Metadata } from "next";

// Sign-in is a status-free entry page, not content: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
