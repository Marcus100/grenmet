#!/usr/bin/env node
// Fails a PR when apps/api/fastapi/openapi.json changes in a way that breaks
// existing API clients. `pnpm check:drift` proves the generated client matches
// the spec; this proves the spec is still backward compatible with the base.
//
// Deliberately small: the common wire-level breaks (removed route or method,
// new required input, removed or retyped output), not the full oasdiff rule set.
// Request types may only widen; response types may only narrow.
//
// Usage: node scripts/api/check-api-breaking.mjs --base origin/dev [--allow-breaking]
// A PR labelled `breaking-change` passes with --allow-breaking (findings still print).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SPEC_PATH = "apps/api/fastapi/openapi.json";
const METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];
const MAX_DEPTH = 8;

const resolveRef = (spec, node) => {
  let current = node;
  for (let hops = 0; current?.$ref && hops < MAX_DEPTH; hops += 1) {
    const name = current.$ref.replace("#/components/schemas/", "");
    current = spec.components?.schemas?.[name];
  }
  return current ?? {};
};

/** Set of JSON types a schema accepts, with unions flattened. */
export function typeSet(spec, node, depth = 0) {
  const schema = resolveRef(spec, node);
  if (depth > MAX_DEPTH) return new Set(["any"]);
  const members = schema.anyOf ?? schema.oneOf;
  if (members) {
    return new Set(members.flatMap((m) => [...typeSet(spec, m, depth + 1)]));
  }
  if (schema.allOf) {
    return typeSet(spec, schema.allOf.at(-1), depth + 1);
  }
  if (schema.type) {
    return new Set([].concat(schema.type));
  }
  if (schema.properties) return new Set(["object"]);
  return new Set(["any"]);
}

const enumValues = (spec, node) => {
  const schema = resolveRef(spec, node);
  return Array.isArray(schema.enum) ? new Set(schema.enum) : null;
};

const covers = (wide, narrow) =>
  wide.has("any") || [...narrow].every((t) => wide.has(t));

const label = (set) => [...set].sort().join("|");

/** Reports a type change and returns false when the schemas are incompatible. */
function compareTypes(ctx, base, head, where, direction) {
  const baseTypes = typeSet(ctx.base, base);
  const headTypes = typeSet(ctx.head, head);
  const ok =
    direction === "request"
      ? covers(headTypes, baseTypes)
      : covers(baseTypes, headTypes);
  if (!ok) {
    ctx.err(
      `${where}: ${direction} type changed ${label(baseTypes)} -> ${label(headTypes)}`
    );
  }
  return ok;
}

function compareEnums(ctx, base, head, where, direction) {
  const baseEnum = enumValues(ctx.base, base);
  const headEnum = enumValues(ctx.head, head);
  if (!(baseEnum && headEnum)) return;
  const removed = [...baseEnum].filter((v) => !headEnum.has(v));
  const added = [...headEnum].filter((v) => !baseEnum.has(v));
  if (direction === "request" && removed.length > 0) {
    ctx.err(
      `${where}: enum value(s) no longer accepted: ${removed.join(", ")}`
    );
  }
  if (direction === "response" && added.length > 0) {
    ctx.warn(
      `${where}: new enum value(s) clients may not handle: ${added.join(", ")}`
    );
  }
}

function compareProperties(ctx, base, head, where, direction, depth) {
  const baseObj = resolveRef(ctx.base, base);
  const headObj = resolveRef(ctx.head, head);
  const headProps = headObj.properties ?? {};
  for (const [name, schema] of Object.entries(baseObj.properties ?? {})) {
    const path = `${where}.${name}`;
    if (name in headProps) {
      compareSchema(ctx, schema, headProps[name], path, direction, depth + 1);
    } else if (direction === "response") {
      ctx.err(`${path}: response property removed`);
    }
  }
  if (direction === "request") {
    const baseRequired = new Set(baseObj.required ?? []);
    for (const name of headObj.required ?? []) {
      if (!baseRequired.has(name)) {
        ctx.err(`${where}.${name}: request property is newly required`);
      }
    }
  }
  if (baseObj.items && headObj.items) {
    compareSchema(
      ctx,
      baseObj.items,
      headObj.items,
      `${where}[]`,
      direction,
      depth + 1
    );
  }
}

/**
 * Compare two schemas. `direction` is "request" (the client sends it) or
 * "response" (the client reads it).
 */
function compareSchema(ctx, base, head, where, direction, depth = 0) {
  if (depth > MAX_DEPTH) return;
  if (!compareTypes(ctx, base, head, where, direction)) return;
  compareEnums(ctx, base, head, where, direction);
  compareProperties(ctx, base, head, where, direction, depth);
}

const paramKey = (p) => `${p.in}:${p.name}`;

function compareParameters(ctx, base, head, op) {
  const resolveParam = (spec, p) => (p.$ref ? resolveRef(spec, p) : p);
  const baseParams = new Map(
    (base.parameters ?? []).map((p) => [
      paramKey(resolveParam(ctx.base, p)),
      resolveParam(ctx.base, p),
    ])
  );
  const headParams = new Map(
    (head.parameters ?? []).map((p) => [
      paramKey(resolveParam(ctx.head, p)),
      resolveParam(ctx.head, p),
    ])
  );
  for (const [key, param] of headParams) {
    const before = baseParams.get(key);
    if (!before && param.required) {
      ctx.err(`${op}: new required ${param.in} parameter '${param.name}'`);
    } else if (before && !before.required && param.required) {
      ctx.err(`${op}: ${param.in} parameter '${param.name}' became required`);
    } else if (before) {
      compareSchema(
        ctx,
        before.schema ?? {},
        param.schema ?? {},
        `${op} ${param.in} '${param.name}'`,
        "request"
      );
    }
  }
  for (const [key, param] of baseParams) {
    if (!headParams.has(key)) {
      ctx.warn(`${op}: ${param.in} parameter '${param.name}' removed`);
    }
  }
}

const jsonSchema = (content) =>
  content?.["application/json"]?.schema ??
  Object.values(content ?? {})[0]?.schema;

function compareRequestBody(ctx, base, head, op) {
  const baseBody = base.requestBody;
  const headBody = head.requestBody;
  if (!headBody) return;
  if (!baseBody && headBody.required) {
    ctx.err(`${op}: request body is newly required`);
  } else if (baseBody && !baseBody.required && headBody.required) {
    ctx.err(`${op}: request body became required`);
  } else if (baseBody) {
    const a = jsonSchema(baseBody.content);
    const b = jsonSchema(headBody.content);
    if (a && b) compareSchema(ctx, a, b, `${op} body`, "request");
  }
}

function compareResponses(ctx, base, head, op) {
  for (const [status, response] of Object.entries(base.responses ?? {})) {
    if (!status.startsWith("2")) continue;
    const next = head.responses?.[status];
    if (!next) {
      ctx.err(`${op}: success response ${status} removed`);
      continue;
    }
    const a = jsonSchema(resolveRef(ctx.base, response).content);
    const b = jsonSchema(resolveRef(ctx.head, next).content);
    if (a && b) compareSchema(ctx, a, b, `${op} ${status}`, "response");
  }
}

function compareOperation(ctx, base, head, op) {
  if (base.operationId !== head.operationId) {
    ctx.warn(
      `${op}: operationId ${base.operationId} -> ${head.operationId} (renames generated client hooks)`
    );
  }
  compareParameters(ctx, base, head, op);
  compareRequestBody(ctx, base, head, op);
  compareResponses(ctx, base, head, op);
}

/** Returns { errors, warnings } for base -> head. */
export function compareSpecs(base, head) {
  const errors = [];
  const warnings = [];
  const ctx = {
    base,
    head,
    err: (m) => errors.push(m),
    warn: (m) => warnings.push(m),
  };
  for (const [path, baseItem] of Object.entries(base.paths ?? {})) {
    const headItem = head.paths?.[path];
    for (const method of METHODS) {
      if (!baseItem[method]) continue;
      const op = `${method.toUpperCase()} ${path}`;
      if (!headItem?.[method]) {
        ctx.err(`${op}: operation removed`);
        continue;
      }
      compareOperation(ctx, baseItem[method], headItem[method], op);
    }
  }
  return { errors, warnings };
}

function readBase(ref) {
  const result = spawnSync("git", ["show", `${ref}:${SPEC_PATH}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `Cannot read ${SPEC_PATH} at ${ref}: ${result.stderr.trim()}`
    );
  }
  return JSON.parse(result.stdout);
}

function main(argv) {
  const baseIndex = argv.indexOf("--base");
  if (baseIndex === -1 || !argv[baseIndex + 1]) {
    process.stderr.write(
      "usage: check-api-breaking.mjs --base <git-ref> [--allow-breaking]\n"
    );
    return 2;
  }
  const allow = argv.includes("--allow-breaking");
  const base = readBase(argv[baseIndex + 1]);
  const head = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  const { errors, warnings } = compareSpecs(base, head);
  for (const message of warnings) process.stdout.write(`warning: ${message}\n`);
  for (const message of errors) process.stdout.write(`BREAKING: ${message}\n`);
  if (errors.length === 0) {
    process.stdout.write(
      `No breaking API changes (${warnings.length} warning(s)).\n`
    );
    return 0;
  }
  if (allow) {
    process.stdout.write(
      `${errors.length} breaking change(s) allowed by the breaking-change label.\n`
    );
    return 0;
  }
  process.stdout.write(
    `${errors.length} breaking change(s). Make them additive, or label the PR 'breaking-change' and update every consumer.\n`
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main(process.argv.slice(2)));
}
