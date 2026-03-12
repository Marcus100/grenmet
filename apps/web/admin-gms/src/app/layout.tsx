import { Outfit } from "next/font/google";
import "./globals.css";

import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
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

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <QueryProvider>
          <ApiProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <SidebarProvider>{children}</SidebarProvider>
            </ThemeProvider>
          </ApiProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
