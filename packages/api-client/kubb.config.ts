import { defineConfig } from "@kubb/core";
import { pluginClient } from "@kubb/plugin-client";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginReactQuery } from "@kubb/plugin-react-query";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";

export default defineConfig(({ watch }) => ({
  name: "api-client",
  root: ".",
  input: {
    path: "../../apps/api/fastapi/openapi.json",
  },
  output: {
    path: "./src/gen",
    clean: !watch,
    barrelType: "named",
    format: "biome",
    extension: { ".ts": ".js" },
    defaultBanner: "simple",
  },
  plugins: [
    pluginOas({
      validate: true,
      collisionDetection: true,
    }),
    pluginTs({
      output: {
        path: "models",
      },
    }),
    pluginClient({
      output: {
        path: "clients",
      },
      client: "fetch",
      importPath: "../../client.js",
    }),
    pluginReactQuery({
      output: {
        path: "hooks",
      },
      client: {
        importPath: "../../client.js",
      },
    }),
    pluginZod({
      output: {
        path: "zod",
      },
    }),
  ],
}));
