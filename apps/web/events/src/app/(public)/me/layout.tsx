import type { Metadata } from "next";

// Private to the signed-in person: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
