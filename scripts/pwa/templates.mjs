// The files `pnpm new:pwa` writes into apps/pwa/<name>. Placeholders:
// __NAME__ (folder), __TITLE__ (app name), __SHORT__ (home-screen label),
// __PORT__, __SITE__ (public origin), __BACKGROUND__, __ACCENT__,
// __ON_ACCENT__, __ROBOTS__, __CAMERA__ (camera permission), __WASM__ (the
// WebAssembly script source for the barcode reader).

export const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the app is files only; every server answer comes from FastAPI.
  output: "export",
  typedRoutes: true,
  poweredByHeader: false,
  reactCompiler: true,
};

export default nextConfig;
`;

export const POSTCSS_CONFIG = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;

export const TSCONFIG = `{
  "extends": "@barrelsgd/tsconfig/tsconfig.nextjs.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
`;

export const VITEST_CONFIG = `import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cold imports are slow under a full parallel run; the 5 s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Turbo runs two test tasks at once; half the cores each keeps them from starving each other.
    maxWorkers: "50%",
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
`;

export const GITIGNORE = `# Shared ignores are inherited from the repository .gitignore.
/next-env.d.ts
`;

export const GITIGNORE_SCANNER = `# Copied from node_modules by pwa-kit-copy-zxing before dev and build.
/public/zxing/
`;

export const HEADERS = `# Response headers for static hosting (copied to out/ by next build).
# connect-src lists the only API origin the app may call. Changing it means
# changing NEXT_PUBLIC_API_URL together.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=__CAMERA__, microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'__WASM__; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://api.barrels.gd; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
`;

export const ENV = `// Typed environment for __TITLE__. The only place that reads \`process.env\`.
// Every value has a safe default and a bad value falls back.

const DEFAULT_SITE_URL = "__SITE__";

function originOf(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

export interface AppEnv {
  /** Public origin of the app, used for page metadata. */
  readonly SITE_URL: string;
}

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  return { SITE_URL: originOf(source.SITE_URL, DEFAULT_SITE_URL) };
}

export const env = parseEnv({ SITE_URL: process.env.SITE_URL });
`;

export const ENV_TEST = `import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

const SITE = "__SITE__";

describe("parseEnv", () => {
  it("falls back to the app's public address", () => {
    expect(parseEnv({}).SITE_URL).toBe(SITE);
    expect(parseEnv({ SITE_URL: "not a url" }).SITE_URL).toBe(SITE);
  });

  it("keeps only the origin of a given address", () => {
    expect(parseEnv({ SITE_URL: "https://example.com/path" }).SITE_URL).toBe(
      "https://example.com"
    );
  });
});
`;

export const LAYOUT = `import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { env } from "@/env";
import "@/styles/app.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.SITE_URL),
  title: "__TITLE__",
  applicationName: "__TITLE__",
  appleWebApp: {
    capable: true,
    title: "__SHORT__",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  __ROBOTS__
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "__BACKGROUND__",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className="h-full antialiased" lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
`;

export const ROBOTS_PUBLIC = `// A public app: search engines may list it.
  robots: { index: true, follow: true },`;

export const ROBOTS_PRIVATE = `// A staff tool: nothing here is for search engines.
  robots: { index: false, follow: false },`;

export const PAGE = `import { Home } from "@/components/home";

/** The static page; everything after the first paint runs in the browser. */
export default function HomePage() {
  return <Home />;
}
`;

export const MANIFEST = `import type { MetadataRoute } from "next";

// Written once at build time (static export).
export const dynamic = "force-static";

/**
 * The web app manifest: what makes "Add to Home Screen" install the app with
 * its own icon and no browser bar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "__TITLE__",
    short_name: "__SHORT__",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "__BACKGROUND__",
    theme_color: "__BACKGROUND__",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
`;

export const MANIFEST_TEST = `import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const publicDir = path.resolve(import.meta.dirname, "../../public");

describe("manifest", () => {
  const data = manifest();

  it("opens full screen from the home screen", () => {
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/");
  });

  it("has the icon sizes phones need to offer installation", () => {
    const sizes = data.icons?.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(data.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("points only at icon files that exist", () => {
    for (const icon of data.icons ?? []) {
      expect(existsSync(path.join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });
});
`;

export const HOME = `import { InstallHint } from "@barrelsgd/pwa-kit/components/install-hint";

/** The first screen. Replace it with the app's own. */
export function Home() {
  return (
    <main className="pwa-screen flex min-h-dvh flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">__TITLE__</h1>
        <p className="text-pwa-muted text-base">This app is being built.</p>
      </header>
      <InstallHint title="Install __TITLE__" />
    </main>
  );
}
`;

export const HOME_TEST = `// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Home } from "@/components/home";

afterEach(cleanup);

describe("Home", () => {
  it("names the app", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "__TITLE__" })
    ).toBeInTheDocument();
  });
});
`;

export const TEST_SETUP = `import "@testing-library/jest-dom/vitest";
`;

export const APP_CSS = `@import "tailwindcss";
@import "@barrelsgd/ui/styles/app-feel";
@import "@barrelsgd/pwa-kit/styles/base";

/*
 * __TITLE__'s look. The shared parts (packages/pwa-kit) colour themselves only
 * with the --color-pwa-* names; set them here. Never use --gm-* tokens.
 */
@theme {
  --color-pwa-background: __BACKGROUND__;
  --color-pwa-accent: __ACCENT__;
  --color-pwa-on-accent: __ON_ACCENT__;

  --font-sans: system-ui, sans-serif;
}

html,
body {
  height: 100%;
}
`;

export const AGENTS = `# __TITLE__ (\`@barrelsgd/pwa-__NAME__\`)

Port **__PORT__** (local dev only). Static export (\`output: "export"\`, written
to \`out/\`). Created with \`pnpm new:pwa\` on the shared phone-app kit
\`packages/pwa-kit\`: read \`packages/pwa-kit/AGENTS.md\` before changing a
shared part. Planned public address: \`__SITE__\`.

## What exists

- Installable shell: manifest (\`src/app/manifest.ts\`), placeholder icons in
  \`public/icons/\` (plain colour squares; replace them with real artwork), and
  the shared install guide.
- First screen: \`src/components/home.tsx\`.

## Rules

- Everything stays static: no server actions, no route handlers that need a
  server, no \`next/image\` optimisation. Backend logic goes in FastAPI.
- \`src/env.ts\` is the only place that reads \`process.env\`.
- Errors: when a screen catches an error and shows a fallback, add
  \`src/lib/report-error.ts\` re-exporting \`reportError\` from
  \`@barrelsgd/pwa-kit/lib/report-error\` (as \`apps/pwa/printix\` does).
- Colours: set the \`--color-pwa-*\` names in \`src/styles/app.css\`; never
  \`--gm-*\` tokens. When the look is decided, write the lane spec
  \`docs/design/__NAME__.md\` and map it in \`scripts/docs/design-md.test.mjs\`.
- Response headers live in \`public/_headers\`. \`connect-src\` names the only
  API origin the app may call.
- Controls at least 44 px tall; inputs at 16 px or more so iPhone does not zoom.
- Tests: \`pnpm --filter @barrelsgd/pwa-__NAME__ test\`. Dev:
  \`pnpm dev:pwa:__NAME__\` (host only).
`;
