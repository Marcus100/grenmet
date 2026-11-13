// When does a FastAPI route change need a hand-written edit to
// docs/api/contracts.md? The full route list is generated (docs/api/routes.md);
// the contract document holds behaviour and policy, so it is required only for
// the changes below. Pure functions: the guardrail reads the specs from Git.
import { createHash } from "node:crypto";
import { compareSpecs } from "../api/check-api-breaking.mjs";
import { collectOperations } from "../api/route-index.mjs";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

const keyOf = (operation) => `${operation.method} ${operation.path}`;

// A fingerprint of one operation with every $ref replaced by the fingerprint of
// its target, so a change to a schema it uses counts as a change to the route.
// A reference cycle is cut at its second visit.
function makeFingerprinter(spec) {
  const memo = new Map();
  const walking = new Set();
  const hash = (text) => createHash("sha1").update(text).digest("hex");

  const resolve = (node) => {
    if (Array.isArray(node)) return node.map(resolve);
    if (node === null || typeof node !== "object") return node;
    const entries = Object.entries(node).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    const out = {};
    for (const [key, value] of entries) {
      out[key] =
        key === "$ref" && typeof value === "string"
          ? refHash(value)
          : resolve(value);
    }
    return out;
  };

  const refHash = (ref) => {
    if (memo.has(ref)) return memo.get(ref);
    if (walking.has(ref)) return `cycle:${ref}`;
    walking.add(ref);
    let target = spec;
    for (const part of ref.replace(/^#\//u, "").split("/")) {
      target = target?.[part.replace(/~1/gu, "/").replace(/~0/gu, "~")];
    }
    const value = hash(JSON.stringify(resolve(target ?? null)));
    walking.delete(ref);
    memo.set(ref, value);
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

// A path as the contract document would write it: any {parameter} name matches.
function pathPattern(path) {
  const escaped = path
    .split(/\{[^}]*\}/u)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\{[^}]*\\}");
  return new RegExp(escaped, "u");
}

const isPublicSurface = (operation) =>
  operation.zone === "public" || operation.path.includes("/webhooks/");

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
      reasons.push(`added public or webhook operation ${key}`);
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
