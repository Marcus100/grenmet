import { Inter } from "next/font/google";
import "./globals.css";

import type { Metadata } from "next";
import { ApiProvider } from "@/components/providers/ApiProvider";
import { SidebarProvider } from "@/context/SidebarContext";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
  title: {
    default: "Grenada Meteorological Service",
    template: "%s | Grenada Meteorological Service",
  },
  description: "Your weather dashboard description",
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
        <QueryProvider>
          <ApiProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </ApiProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
