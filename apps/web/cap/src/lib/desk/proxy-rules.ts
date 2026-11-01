/**
 * The only FastAPI calls the desk's browser code may make through
 * `/desk/api/...`. Anything else is refused before a token is attached, so the
 * proxy can never be used to reach other domains with a forecaster's session.
 *
 * A matching browser path yields a constant upstream template plus the UUIDs
 * it carried, each re-validated. The upstream URL is then built from that
 * template, never from the browser's raw path or query string.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_STRICT = new RegExp(`^${UUID}$`);
const ACTIONS = [
  "validate",
  "submit",
  "reviews",
  "approve",
  "publish",
  "emergency-publish",
  "cancel",
  "expire",
  "updates",
] as const;

/** Placeholder in a template; each one takes the next validated id. */
const ID_SLOT = /\{id\}/g;

interface Rule {
  readonly method: string;
  /** Anchored. Every capture group is one id and must be a UUID. */
  readonly path: RegExp;
  /** Constant upstream path. Only `{id}` slots are filled at runtime. */
  readonly template: string;
}

const ALERT_ACTION_RULES: readonly Rule[] = ACTIONS.map((action) => ({
  method: "POST",
  path: new RegExp(`^/api/v1/cap/alerts/(${UUID})/${action}$`),
  template: `/api/v1/cap/alerts/{id}/${action}`,
}));

const RULES: readonly Rule[] = [
  {
    method: "POST",
    path: /^\/api\/v1\/cap\/alerts$/,
    template: "/api/v1/cap/alerts",
  },
  {
    method: "GET",
    path: new RegExp(`^/api/v1/cap/alerts/(${UUID})$`),
    template: "/api/v1/cap/alerts/{id}",
  },
  {
    method: "PATCH",
    path: new RegExp(`^/api/v1/cap/alerts/(${UUID})$`),
    template: "/api/v1/cap/alerts/{id}",
  },
  ...ALERT_ACTION_RULES,
  {
    method: "GET",
    path: /^\/api\/v1\/cap\/areas\/predefined$/,
    template: "/api/v1/cap/areas/predefined",
  },
  // Source bulletin picker: the public list of published GMS products.
  {
    method: "GET",
    path: /^\/api\/v1\/wxproducts\/public\/products$/,
    template: "/api/v1/wxproducts/public/products",
  },
];

export const DESK_API_PREFIX = "/desk";

/** An allow-listed desk call: a constant upstream template and its UUIDs. */
export interface DeskCall {
  readonly ids: readonly string[];
  readonly template: string;
}

/**
 * Returns the allow-listed call for a browser request, or null. The browser
 * path is only inspected here. The result holds nothing from it except UUIDs
 * that passed the strict check.
 */
export function resolveDeskCall(method: string, path: string): DeskCall | null {
  const normalised = path.toLowerCase();
  if (normalised !== path || path.includes("..") || path.includes("//")) {
    return null;
  }
  for (const rule of RULES) {
    if (rule.method !== method) continue;
    const match = rule.path.exec(path);
    if (!match) continue;
    const ids: string[] = [];
    for (const captured of match.slice(1)) {
      if (!UUID_STRICT.test(captured)) return null;
      ids.push(captured.toLowerCase());
    }
    return { template: rule.template, ids };
  }
  return null;
}

export function isAllowedDeskCall(method: string, path: string): boolean {
  return resolveDeskCall(method, path) !== null;
}

/**
 * Builds the FastAPI URL for an allowed call from its template and validated
 * ids only. No query string is forwarded: no desk call needs one, so a
 * browser-supplied `?...` is dropped rather than passed upstream.
 */
export function deskUpstreamUrl(call: DeskCall, apiBaseUrl: string): URL {
  let next = 0;
  const path = call.template.replace(ID_SLOT, () => {
    const id = call.ids[next];
    next += 1;
    if (id === undefined || !UUID_STRICT.test(id)) {
      throw new Error("Desk call template and ids do not match.");
    }
    return encodeURIComponent(id);
  });
  if (next !== call.ids.length) {
    throw new Error("Desk call template and ids do not match.");
  }
  const base = new URL(apiBaseUrl);
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error("Desk upstream left the configured API origin.");
  }
  return url;
}
