import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the scanner is files only; every server answer comes from FastAPI.
  output: "export",
  typedRoutes: true,
  poweredByHeader: false,
  reactCompiler: true,
};

export default nextConfig;
