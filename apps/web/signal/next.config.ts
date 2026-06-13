import { fileURLToPath } from "node:url";
import { withContentCollections } from "@content-collections/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(process.env.NODE_ENV === "production" && {
    outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
    outputFileTracingIncludes: {
      "/**/*": ["./content/**/*.mdx"],
    },
  }),
  pageExtensions: ["js", "jsx", "ts", "tsx"],
};

export default withContentCollections(nextConfig);
