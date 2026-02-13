import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "../../apps/api/fastapi/openapi.json",
  output: {
    path: "./src",
    postProcess: ["prettier"],
  },
  types: {
    enums: "typescript",
  },
});
