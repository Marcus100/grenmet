import { version } from "maplibre-gl/package.json";

/**
 * Where the browser loads MapLibre's web worker from; pass it to every map as
 * react-map-gl's `workerUrl` prop. scripts/copy-maplibre-worker.mjs copies the
 * file into public/.
 *
 * MapLibre 6 otherwise works the address out from `import.meta.url`, which is
 * not a web address inside a Next.js bundle: the address comes out empty, the
 * worker fails ("Worker failed to load") and GeoJSON layers such as the
 * parishes are never drawn. Same origin, so CSP `worker-src 'self'` allows it.
 * The version query stops a cached old worker pairing with a newer MapLibre.
 */
export const MAPLIBRE_WORKER_FILE = "maplibre-gl-worker.mjs";
export const MAPLIBRE_WORKER_URL = `/${MAPLIBRE_WORKER_FILE}?v=${version}`;
