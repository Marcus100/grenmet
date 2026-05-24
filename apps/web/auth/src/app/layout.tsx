import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" style={{ colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}
