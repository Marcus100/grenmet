import { adapterOas } from "@kubb/adapter-oas";
import { parserTs } from "@kubb/parser-ts";
import { pluginFetch } from "@kubb/plugin-fetch";
import { pluginReactQuery } from "@kubb/plugin-react-query";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
import { defineConfig } from "kubb/config";

export default defineConfig(({ watch }) => ({
  name: "api-client",
  root: ".",
  input: "../../apps/api/fastapi/openapi.json",
  adapter: adapterOas({ validate: true, integerType: "number" }),
  output: {
    path: "./src/gen",
    clean: !watch,
    barrel: { type: "named" },
    format: "biome",
    defaultBanner: "simple",
  },
  parsers: [parserTs({ extension: { ".ts": ".js" } })],
  plugins: [
    pluginTs({
      output: { path: "models" },
      enum: { type: "asConst", typeSuffix: "" },
    }),
    pluginFetch({ output: { path: "clients" } }),
    pluginReactQuery({
      output: { path: "hooks" },
      client: "fetch",
      hooks: true,
    }),
    pluginZod({ output: { path: "zod" } }),
  ],
}));
