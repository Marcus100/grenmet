import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const SVG_REGEX = /\.svg$/;

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../..", import.meta.url)),
  webpack(config) {
    config.module.rules.push({
      test: SVG_REGEX,
      use: ["@svgr/webpack"],
    });
    return config;
  },

  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
