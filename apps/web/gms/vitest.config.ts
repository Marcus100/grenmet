import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
      // Static image imports: see src/test/image-stub.ts.
      {
        find: /^.*\.(png|jpe?g|gif|svg|webp|avif)$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./src/test/image-stub.ts"
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    maxWorkers: 2,
    setupFiles: ["./src/test/setup.ts"],
  },
});
