import { Hono } from "hono";
import { healthRoute } from "./health.js";

export const routes = new Hono();

routes.route("/health", healthRoute);

// Future routes go here:
// routes.route("/webhooks", webhooksRoute);
// routes.route("/bff/salesbus", salesbusBffRoute);
