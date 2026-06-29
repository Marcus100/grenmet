import "./globals.css";

import { PreferencesStoreProvider } from "@grenmet/theme/components/preferences-provider";
import { ThemeBootScript } from "@grenmet/theme/components/theme-boot";
import { PREFERENCE_DEFAULTS } from "@grenmet/theme/lib/preferences-config";
import { PostHogProvider } from "@grenmet/ui/components/posthog-provider";
import type { Metadata } from "next";
import { ApiProvider } from "@/components/providers/ApiProvider";
import { env } from "@/lib/env";
import { fontVars } from "@/lib/fonts/registry";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
  title: {
    default: "Grenada Meteorological Service",
    template: "%s | Grenada Meteorological Service",
  },
  description: "Your weather dashboard description",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const {
    theme_mode,
    theme_preset,
    content_layout,
    font,
    navbar_style,
    sidebar_variant,
    sidebar_collapsible,
  } = PREFERENCE_DEFAULTS;

  return (
    <html
      className={fontVars}
      data-content-layout={content_layout}
      data-font={font}
      data-navbar-style={navbar_style}
      data-sidebar-collapsible={sidebar_collapsible}
      data-sidebar-variant={sidebar_variant}
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/* Applies theme/layout prefs before hydration to avoid flicker (see @grenmet/theme). */}
        <ThemeBootScript />
      </head>
      <body>
        <PostHogProvider
          apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        >
          <PreferencesStoreProvider
            contentLayout={content_layout}
            font={font}
            navbarStyle={navbar_style}
            themeMode={theme_mode}
            themePreset={theme_preset}
          >
            <QueryProvider>
              <ApiProvider>{children}</ApiProvider>
            </QueryProvider>
          </PreferencesStoreProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
