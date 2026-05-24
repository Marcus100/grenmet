import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    hostname: env.HOST,
  },
  (info) => {
    console.log(
      `🔥 Hono API running on http://${info.address}:${info.port} [${env.ENVIRONMENT}]`
    );
  }
);
