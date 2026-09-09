export const webImages = [
  { app: "auth", image: "web-auth", path: "apps/web/auth", port: 3000 },
  {
    app: "admin",
    image: "web-gaa-admin",
    path: "apps/web/gaa-admin",
    port: 3001,
  },
  { app: "docs", image: "web-docs", path: "apps/web/docs", port: 3002 },
  { app: "gms", image: "web-gms", path: "apps/web/gms", port: 3003 },
  { app: "cms", image: "web-cms", path: "apps/web/cms", port: 3006 },
  {
    app: "cms-migrate",
    image: "web-cms-migrate",
    path: "apps/web/cms",
    target: "migrate",
  },
  {
    app: "admin-migrate",
    image: "web-gaa-admin-migrate",
    path: "apps/web/gaa-admin",
    target: "migrate",
  },
  { app: "signal", image: "web-signal", path: "apps/web/signal", port: 3004 },
  { app: "mbia", image: "web-mbia", path: "apps/web/mbia", port: 3005 },
  { app: "events", image: "web-events", path: "apps/web/events", port: 3009 },
  { app: "hono", image: "api-hono", path: "apps/api/honoapi", port: 4000 },
];
export const weatherImages = [];
export const releaseScope = {
  web: webImages,
  weather: weatherImages,
  api: true,
};

export function validateReleaseConfiguration(environment) {
  for (const key of ["WEATHER_STAGING_ENABLED", "WEATHER_PRODUCTION_ENABLED"]) {
    if (environment[key] && environment[key] !== "false")
      throw new Error(`${key} contradicts the core-only release scope`);
  }
}

export const coreServices = [
  "db",
  "redis",
  "proxy",
  "api",
  "prestart",
  "worker",
  ...webImages.map((image) => {
    if (image.app === "admin-migrate") return "web-migrate";
    if (image.app === "cms-migrate") return "cms-migrate";
    if (image.app === "hono") return "api-hono";
    return `web-${image.app}`;
  }),
];
export function validateComposeScope(model) {
  const services = Object.keys(model.services ?? {});
  if (coreServices.some((service) => !services.includes(service)))
    throw new Error("Required core service missing from deployment");
  if (
    services.some(
      (service) => !coreServices.includes(service) && service !== "adminer"
    )
  )
    throw new Error(
      "Deployment includes a service outside the reviewed core scope"
    );
}
