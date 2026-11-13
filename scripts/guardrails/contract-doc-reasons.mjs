// When does a FastAPI route change need a hand-written edit to
// docs/api/contracts.md? The full route list is generated (docs/api/routes.md);
// the contract document holds behaviour and policy, so it is required only for
// the changes below. Pure functions: the guardrail reads the specs from Git.
import { createHash } from "node:crypto";
import { compareSpecs } from "../api/check-api-breaking.mjs";
import { collectOperations } from "../api/route-index.mjs";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
const REF_PREFIX = /^#\//u;
const ESCAPED_SLASH = /~1/gu;
const ESCAPED_TILDE = /~0/gu;
const PATH_PARAMETER = /\{[^}]*\}/u;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;

function compareKeys(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const keyOf = (operation) => `${operation.method} ${operation.path}`;

// A fingerprint of one operation with every $ref replaced by the fingerprint of
// its target, so a change to a schema it uses counts as a change to the route.
// A reference cycle is cut at its second visit. A hash computed under a cut
// depends on where the walk entered the cycle, so it is never memoised.
function makeFingerprinter(spec) {
  const memo = new Map();
  const walking = new Set();
  let cuts = 0;
  const hash = (text) => createHash("sha1").update(text).digest("hex");

  const resolve = (node) => {
    if (Array.isArray(node)) return node.map(resolve);
    if (node === null || typeof node !== "object") return node;
    const entries = Object.entries(node).sort(([a], [b]) => compareKeys(a, b));
    // Entries as an array, never an object: a "__proto__" key cannot vanish.
    return entries.map(([key, value]) => [
      key,
      key === "$ref" && typeof value === "string"
        ? refHash(value)
        : resolve(value),
    ]);
  };

  const refHash = (ref) => {
    if (memo.has(ref)) return memo.get(ref);
    if (walking.has(ref)) {
      cuts += 1;
      return `cycle:${ref}`;
    }
    const cutsBefore = cuts;
    walking.add(ref);
    let target = spec;
    for (const part of ref.replace(REF_PREFIX, "").split("/")) {
      target =
        target?.[part.replace(ESCAPED_SLASH, "/").replace(ESCAPED_TILDE, "~")];
    }
    const value = hash(JSON.stringify(resolve(target ?? null)));
    walking.delete(ref);
    if (cuts === cutsBefore) memo.set(ref, value);
    return value;
  };

  return (operation) => hash(JSON.stringify(resolve(operation)));
}

function operationsOf(spec) {
  const map = new Map();
  const fingerprint = makeFingerprinter(spec);
  const records = collectOperations(spec);
  for (const record of records) {
    const operation = spec.paths?.[record.path]?.[record.method.toLowerCase()];
    if (!(operation && METHODS.includes(record.method.toLowerCase()))) continue;
    const security = operation.security ?? spec.security ?? null;
    map.set(keyOf(record), {
      ...record,
      security: JSON.stringify(security),
      fingerprint: fingerprint(operation),
    });
  }
  return map;
}

// A path as the contract document would write it: any {parameter} name matches,
// and the whole path must match (so /a/x does not match /a/x-y or /a/x/{id}).
function pathPattern(path) {
  const escaped = path
    .split(PATH_PARAMETER)
    .map((part) => part.replace(REGEX_SPECIAL, "\\$&"))
    .join("\\{[^}]*\\}");
  return new RegExp(`(?<![\\w/-])${escaped}(?![\\w/{-])`, "u");
}

const WEBHOOK = /\/webhooks?(?:\/|$)/u;

// Reachable without signing in, or a webhook: the reader of the contract
// document needs to know, whatever zone the path is in.
const isPublicSurface = (operation) =>
  operation.zone === "public" ||
  operation.auth === "no" ||
  WEBHOOK.test(operation.path);

/**
 * Reasons the contract document must change, as plain sentences. Empty means
 * the generated route index is enough. `before` and `after` are parsed OpenAPI
 * documents, `contractsText` is docs/api/contracts.md at the base.
 */
export function contractDocReasons(before, after, contractsText) {
  const reasons = [];
  const was = operationsOf(before);
  const now = operationsOf(after);

  for (const [key, operation] of was) {
    if (!now.has(key)) reasons.push(`removed operation ${key}`);
    else if (now.get(key).security !== operation.security)
      reasons.push(`changed authentication on ${key}`);
  }
  for (const [key, operation] of now) {
    if (!was.has(key) && isPublicSurface(operation))
      reasons.push(`added public, unauthenticated or webhook operation ${key}`);
  }
  if (
    JSON.stringify(before.components?.securitySchemes ?? null) !==
    JSON.stringify(after.components?.securitySchemes ?? null)
  ) {
    reasons.push("changed the security schemes");
  }
  const { errors } = compareSpecs(before, after);
  for (const message of errors) reasons.push(`breaking change: ${message}`);

  for (const [key, operation] of now) {
    const previous = was.get(key);
    if (
      previous &&
      previous.fingerprint !== operation.fingerprint &&
      pathPattern(operation.path).test(contractsText)
    ) {
      reasons.push(
        `changed ${key}, which docs/api/contracts.md already describes`
      );
    }
  }
  return [...new Set(reasons)];
}
