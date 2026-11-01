/**
 * The only FastAPI calls the desk's browser code may make through
 * `/desk/api/...`. Anything else is refused before a token is attached, so the
 * proxy can never be used to reach other domains with a forecaster's session.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ACTIONS =
  "validate|submit|reviews|approve|publish|emergency-publish|cancel|expire|updates";

const RULES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: "POST", path: /^\/api\/v1\/cap\/alerts$/ },
  { method: "GET", path: new RegExp(`^/api/v1/cap/alerts/${UUID}$`) },
  { method: "PATCH", path: new RegExp(`^/api/v1/cap/alerts/${UUID}$`) },
  {
    method: "POST",
    path: new RegExp(`^/api/v1/cap/alerts/${UUID}/(?:${ACTIONS})$`),
  },
  { method: "GET", path: /^\/api\/v1\/cap\/areas\/predefined$/ },
  // Source bulletin picker: the public list of published GMS products.
  { method: "GET", path: /^\/api\/v1\/wxproducts\/public\/products$/ },
];

export const DESK_API_PREFIX = "/desk";

export function isAllowedDeskCall(method: string, path: string): boolean {
  const normalised = path.toLowerCase();
  if (normalised !== path || path.includes("..") || path.includes("//")) {
    return false;
  }
  return RULES.some((rule) => rule.method === method && rule.path.test(path));
}
