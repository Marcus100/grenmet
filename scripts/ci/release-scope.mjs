export const webImages = [
  { app: "auth", image: "web-auth", path: "apps/web/auth", port: 3000 },
  // Listed before the console on purpose: the rolling deploy replaces routed
  // services in this order, so the portal is up before the old web-admin
  // container (the former gaa-admin) is replaced by the console.
  // GMS/GAA staff portal (apps/web/gaa-admin) at gms.barrels.gd; the image
  // keeps its name so existing tags and caches stay valid. The app key (service
  // web-gmsadmin) differs from the host because web-gms is the public weather site.
  {
    app: "gmsadmin",
    router: "gms-portal",
    host: "gms",
    image: "web-gaa-admin",
    path: "apps/web/gaa-admin",
    port: 3001,
  },
  // Barrels staff / superuser control plane at admin.barrels.gd (ADR-0039).
  {
    app: "admin",
    // Traefik router/service label name (the old web-admin was gaa-admin).
    router: "barrels-admin",
    image: "web-admin",
    path: "apps/web/admin",
    port: 3012,
  },
  { app: "docs", image: "web-docs", path: "apps/web/docs", port: 3002 },
  // Served at weather.barrels.gd, so its public address uses that host.
  {
    app: "gms",
    host: "weather",
    image: "web-gms",
    path: "apps/web/gms",
    port: 3003,
  },
  { app: "cms", image: "web-cms", path: "apps/web/cms", port: 3006 },
  {
    app: "cms-migrate",
    image: "web-cms-migrate",
    path: "apps/web/cms",
    target: "migrate",
  },
  { app: "signal", image: "web-signal", path: "apps/web/signal", port: 3004 },
  { app: "mbia", image: "web-mbia", path: "apps/web/mbia", port: 3005 },
  { app: "events", image: "web-events", path: "apps/web/events", port: 3009 },
  { app: "cap", image: "web-cap", path: "apps/web/cap", port: 3010 },
  {
    app: "gmsdash",
    image: "web-gmsdash",
    path: "apps/web/gmsdash",
    port: 3013,
  },
  {
    app: "bookings",
    image: "web-bookings",
    path: "apps/web/bookings",
    port: 3015,
  },
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

// Roles follow the delivery order in scripts/production/core.sh: data services
// first, migrations next, then everything the deployment starts after migrations.
export const dataServices = ["db", "redis"];
export const migrationServices = ["prestart", "cms-migrate"];
export const appServices = [
  "api",
  "worker",
  "nhc-worker",
  ...webImages
    .filter((image) => image.app !== "cms-migrate")
    .map((image) => `web-${image.app}`),
  "proxy",
];
// Traefik-routed services that a rolling start may briefly run twice (old and
// new container side by side). They must not publish host ports or pin a
// container_name, or the second container cannot start.
export const routedServices = appServices.filter(
  (service) => service === "api" || service.startsWith("web-")
);
export const coreServices = [
  ...dataServices,
  ...migrationServices,
  ...appServices,
];
const HOST_RULE = /Host\(`([^`]+)`\)/g;
// Every Host() in every router rule of a service, by service.
function hostsByService(model) {
  const result = new Map();
  for (const [service, definition] of Object.entries(model.services ?? {})) {
    for (const [key, rule] of Object.entries(definition.labels ?? {})) {
      if (!(key.startsWith("traefik.http.routers.") && key.endsWith(".rule")))
        continue;
      for (const match of String(rule).matchAll(HOST_RULE)) {
        if (!result.has(match[1])) result.set(match[1], new Set());
        result.get(match[1]).add(service);
      }
    }
  }
  return result;
}
// The Barrels console (admin.*) and the GMS/GAA portal must never share a host,
// and no other service may route either host: a dropped or duplicated rule has
// to fail the deployment, not move a host silently.
export function validateAdminHosts(model) {
  const byHost = hostsByService(model);
  const hostsOf = (service) =>
    [...byHost].filter(([, services]) => services.has(service)).map(([h]) => h);
  const consoleHosts = hostsOf("web-admin");
  const portalHosts = hostsOf("web-gmsadmin");
  if (consoleHosts.length !== 1 || portalHosts.length === 0)
    throw new Error("Admin console and portal routers need explicit hosts");
  if (
    consoleHosts.some(
      (host) => !host.includes(".") || portalHosts.includes(host)
    )
  )
    throw new Error(
      "The Barrels admin console and the GMS/GAA portal need distinct, full hostnames"
    );
  for (const host of [...consoleHosts, ...portalHosts])
    if (byHost.get(host).size !== 1)
      throw new Error(`${host} is routed by more than one service`);
}
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
  for (const service of routedServices) {
    const definition = model.services[service] ?? {};
    if (definition.ports?.length || definition.container_name)
      throw new Error(
        `${service} is started with a rolling replacement, so it cannot publish host ports or set container_name`
      );
  }
}
