import { Hono } from "hono";

export const healthRoute = new Hono();

/**
 * GET /health
 * Used by Traefik health checks and monitoring tools.
 * Must remain unauthenticated and dependency-free.
 */
healthRoute.get("/", (c) => c.json({ status: "ok", service: "api-hono" }, 200));
