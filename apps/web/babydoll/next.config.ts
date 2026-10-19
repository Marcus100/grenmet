import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  reactCompiler: true,
};

export default nextConfig;
