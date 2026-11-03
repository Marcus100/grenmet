/**
 * Public settings that differ per environment, read when the app runs rather
 * than when its image is built, so one web image serves staging and production
 * (issue #1019).
 *
 * - On the server (Node.js or edge) values come from the process environment
 *   at request time. The lookup is dynamic on purpose: Next.js inlines only
 *   literal `process.env.NEXT_PUBLIC_*` reads at build time.
 * - In the browser values come from `/runtime-env.js`, which each app serves
 *   from its own environment (`publicEnvResponse`) and loads before hydration
 *   (`PublicEnvScript`).
 */
export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_ENVIRONMENT",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
  "NEXT_PUBLIC_RELEASE",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];
export type PublicEnv = Partial<Record<PublicEnvKey, string>>;

/** Same path in every app; proxies must let it through without a session. */
export const PUBLIC_ENV_PATH = "/runtime-env.js";
export const PUBLIC_ENV_READY_EVENT = "barrels:public-env";
const PUBLIC_ENV_GLOBAL = "__BARRELS_PUBLIC_ENV__";
const LESS_THAN = /</gu;

type PublicEnvWindow = Window & { [PUBLIC_ENV_GLOBAL]?: PublicEnv };
type EnvSource = Record<string, string | undefined>;

/** The process environment, looked up dynamically (also on the edge runtime). */
function serverEnv(): EnvSource {
  return (globalThis as { process?: { env: EnvSource } }).process?.env ?? {};
}

function browserEnv(): PublicEnv | undefined {
  return (window as PublicEnvWindow)[PUBLIC_ENV_GLOBAL];
}

/** The value for `key` in this environment, or undefined when unset. */
export function readPublicEnv(key: PublicEnvKey): string | undefined {
  if (typeof window === "undefined") {
    return serverEnv()[key];
  }
  const loaded = browserEnv();
  // Unit tests run in jsdom without /runtime-env.js; they stub process.env.
  if (!loaded && serverEnv().NODE_ENV === "test") {
    return serverEnv()[key];
  }
  return loaded?.[key];
}

/**
 * Runs `callback` once the browser has the public settings (at once on the
 * server or when they are already loaded). Next.js runs instrumentation-client
 * before `beforeInteractive` scripts, so Sentry's browser init waits here.
 */
export function onPublicEnv(callback: () => void): void {
  if (typeof window === "undefined" || browserEnv()) {
    callback();
    return;
  }
  window.addEventListener(PUBLIC_ENV_READY_EVENT, () => callback(), {
    once: true,
  });
}

/** Body of `/runtime-env.js`: only the listed public keys, never anything else. */
export function publicEnvScript(source: EnvSource = serverEnv()): string {
  const values: PublicEnv = {};
  for (const key of PUBLIC_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      values[key] = value;
    }
  }
  const json = JSON.stringify(values).replace(LESS_THAN, "\\u003c");
  return `window.${PUBLIC_ENV_GLOBAL}=Object.freeze(${json});window.dispatchEvent(new Event(${JSON.stringify(PUBLIC_ENV_READY_EVENT)}));`;
}

/** Response for each app's `app/runtime-env.js/route.ts` (dynamic). */
export function publicEnvResponse(source?: EnvSource): Response {
  return new Response(publicEnvScript(source), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
