import { withContentCollections } from "@content-collections/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages: `next build` writes the site to out/.
  output: "export",
  // Link hrefs are checked against the app's routes at build time.
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  reactCompiler: true,
};

export default withContentCollections(nextConfig);
