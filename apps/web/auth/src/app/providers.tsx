"use client";

import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";
import { Toaster } from "@barrelsgd/ui/components/ui/sonner";
import { ThemeProvider } from "next-themes";

export function Providers({
  apiHost,
  apiKey,
  children,
}: {
  apiHost: string;
  apiKey: string;
  children: React.ReactNode;
}) {
  return (
    <PostHogProvider apiHost={apiHost} apiKey={apiKey}>
      {/* Class-based to match the design system's `dark` variant. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        {children}
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </PostHogProvider>
  );
}
