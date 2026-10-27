/**
 * Validation for the organisation forms. Pure functions over `FormData` so the
 * rules are unit-tested without a server; FastAPI still re-validates everything.
 */

export const KINDS = ["barrels", "client", "business"] as const;
export const STATUSES = ["active", "suspended"] as const;
export type Kind = (typeof KINDS)[number];
export type Status = (typeof STATUSES)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const APP_KEY = /^[a-z][a-z0-9-]{1,59}$/;
const ORGANISATION_ID = /^[A-Za-z0-9_-]{1,100}$/;
const MIN_REASON = 3;
const MAX_REASON = 500;
const MAX_NAME = 255;
const MAX_SLUG = 100;

export type Parsed<T> = { ok: true; value: T } | { ok: false };

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function pick<T extends string>(
  value: string,
  allowed: readonly T[]
): T | undefined {
  return allowed.find((item) => item === value);
}

export function parseOrganisationId(value: string): string | undefined {
  return ORGANISATION_ID.test(value) ? value : undefined;
}

export function parseCreate(
  data: FormData
): Parsed<{ kind: Kind; name: string; slug?: string }> {
  const name = text(data, "name");
  const kind = pick(text(data, "kind"), KINDS);
  const slug = text(data, "slug");
  if (!(name && kind) || name.length > MAX_NAME) return { ok: false };
  if (slug && !(SLUG.test(slug) && slug.length <= MAX_SLUG)) {
    return { ok: false };
  }
  return { ok: true, value: { name, kind, ...(slug ? { slug } : {}) } };
}

export function parseEdit(
  data: FormData
): Parsed<{ kind: Kind; name: string; slug: string }> {
  const created = parseCreate(data);
  const slug = text(data, "slug");
  if (!(created.ok && slug)) return { ok: false };
  return {
    ok: true,
    value: { kind: created.value.kind, name: created.value.name, slug },
  };
}

export function parseReason(data: FormData): Parsed<string> {
  const reason = text(data, "reason");
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return { ok: false };
  }
  return { ok: true, value: reason };
}

export function parseStatus(data: FormData): Parsed<Status> {
  const status = pick(text(data, "status"), STATUSES);
  return status ? { ok: true, value: status } : { ok: false };
}

export function parseEntitlement(
  data: FormData
): Parsed<{ appKey: string; enabled: boolean }> {
  const appKey = text(data, "app_key");
  const enabled = text(data, "enabled");
  if (!APP_KEY.test(appKey) || (enabled !== "true" && enabled !== "false")) {
    return { ok: false };
  }
  return { ok: true, value: { appKey, enabled: enabled === "true" } };
}

/** Fixed codes the page maps to text, so no message is reflected from a URL. */
export const NOTICES = {
  created: { tone: "ok", text: "Organisation created." },
  updated: { tone: "ok", text: "Organisation updated." },
  suspended: {
    tone: "ok",
    text: "Organisation suspended. Its members are refused until it is reactivated.",
  },
  reactivated: { tone: "ok", text: "Organisation reactivated." },
  verified: { tone: "ok", text: "Organisation verified." },
  unverified: { tone: "ok", text: "Verification removed." },
  "app-updated": { tone: "ok", text: "App access updated." },
  invalid: {
    tone: "problem",
    text: "That input was not accepted. Check the fields and try again.",
  },
  conflict: {
    tone: "problem",
    text: "That conflicts with the current state, for example a slug already in use or a verification already recorded.",
  },
  failed: {
    tone: "problem",
    text: "The change could not be saved. Nothing was changed.",
  },
} as const;

export type NoticeCode = keyof typeof NOTICES;

export function noticeFor(
  code: string | undefined
): (typeof NOTICES)[NoticeCode] | undefined {
  return code && Object.hasOwn(NOTICES, code)
    ? NOTICES[code as NoticeCode]
    : undefined;
}

export function noticeForStatus(status: number): NoticeCode {
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "invalid";
  return "failed";
}
