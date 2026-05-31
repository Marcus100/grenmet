import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { routes } from "./routes/index.js";

export function createApp(): Hono {
  const app = new Hono();

  // ── Middleware ───────────────────────────────────────────────────────────────
  app.use("*", logger());

  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  );

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.route("/", routes);

  // ── 404 fallback ─────────────────────────────────────────────────────────────
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  // ── Global error handler ─────────────────────────────────────────────────────
  app.onError((err, c) => {
    // biome-ignore lint/suspicious/noConsole: server error handler
    console.error("[hono] Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
