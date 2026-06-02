import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Grenada CAP Alerts",
    template: "%s | Grenada CAP Alerts",
  },
  description: "Official Common Alerting Protocol alerts for Grenada.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
