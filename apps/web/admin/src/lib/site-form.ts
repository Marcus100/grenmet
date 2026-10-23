/**
 * Validation for the public-site forms (slice C3). Pure functions over
 * `FormData`, unit-tested without a server; FastAPI still re-validates.
 *
 * The Turnstile secret is write-only: it is read from the form, sent once and
 * never echoed back, logged or placed in a redirect.
 */

import type {
  PublicSiteAdmin,
  PublicSiteCreate,
  PublicSiteUpdate,
  TurnstileMode,
} from "@barrelsgd/api-client";
import type { Parsed } from "@/lib/organisation-form";

export const TURNSTILE_MODES = [
  "inherit",
  "off",
  "enforce",
] as const satisfies readonly TurnstileMode[];

export const SITE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SITE_KEY = 40;
const MAX_NAME = 255;
const SITE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 500;
const TRAILING_SLASHES = /\/+$/;

type SiteSettings = Pick<
  PublicSiteCreate,
  | "accepts_contact"
  | "accepts_subscriptions"
  | "contact_recipient"
  | "name"
  | "site_url"
  | "turnstile_mode"
  | "turnstile_site_key"
>;

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseSiteId(value: string): string | undefined {
  return SITE_ID.test(value) ? value : undefined;
}

/** An origin such as `https://barrels.gd`: scheme and host only. */
export function normaliseOrigin(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const bare = value.replace(TRAILING_SLASHES, "");
  return bare === url.origin ? url.origin : undefined;
}

function parseSettings(data: FormData): Parsed<SiteSettings> {
  const name = text(data, "name");
  const siteUrl = text(data, "site_url");
  const recipient = text(data, "contact_recipient");
  const siteKey = text(data, "turnstile_site_key");
  const mode = TURNSTILE_MODES.find((m) => m === text(data, "turnstile_mode"));
  if (!(name && mode) || name.length > MAX_NAME) return { ok: false };
  if (recipient && !EMAIL.test(recipient)) return { ok: false };
  if (recipient.length > MAX_FIELD || siteKey.length > MAX_FIELD) {
    return { ok: false };
  }
  const origin = siteUrl ? normaliseOrigin(siteUrl) : null;
  if (siteUrl && !origin) return { ok: false };
  return {
    ok: true,
    value: {
      name,
      site_url: origin,
      contact_recipient: recipient || null,
      accepts_contact: data.get("accepts_contact") === "on",
      accepts_subscriptions: data.get("accepts_subscriptions") === "on",
      turnstile_mode: mode,
      turnstile_site_key: siteKey || null,
    },
  };
}

export function parseSiteCreate(
  data: FormData,
  organisationId: string
): Parsed<PublicSiteCreate> {
  const key = text(data, "key");
  if (!(SITE_KEY.test(key) && key.length <= MAX_SITE_KEY)) return { ok: false };
  const settings = parseSettings(data);
  if (!settings.ok) return settings;
  const secret = text(data, "turnstile_secret");
  return {
    ok: true,
    value: {
      organisation_id: organisationId,
      key,
      ...settings.value,
      ...(secret ? { turnstile_secret: secret } : {}),
    },
  };
}

/**
 * Compare the submitted form with the stored site and return only what
 * changed, so an untouched field (and the secret) is never re-sent. An empty
 * secret field means "leave it"; clearing is a separate action.
 */
export function parseSiteUpdate(
  data: FormData,
  current: PublicSiteAdmin
): Parsed<PublicSiteUpdate> {
  const settings = parseSettings(data);
  if (!settings.ok) return settings;
  const next = settings.value;
  const body: PublicSiteUpdate = {};
  if (next.name !== current.name) body.name = next.name;
  if (next.site_url !== (current.site_url ?? null)) {
    body.site_url = next.site_url;
  }
  if (next.contact_recipient !== (current.contact_recipient ?? null)) {
    body.contact_recipient = next.contact_recipient;
  }
  if (next.accepts_contact !== current.accepts_contact) {
    body.accepts_contact = next.accepts_contact;
  }
  if (next.accepts_subscriptions !== current.accepts_subscriptions) {
    body.accepts_subscriptions = next.accepts_subscriptions;
  }
  if (next.turnstile_mode !== current.turnstile_mode) {
    body.turnstile_mode = next.turnstile_mode;
  }
  if (next.turnstile_site_key !== (current.turnstile_site_key ?? null)) {
    body.turnstile_site_key = next.turnstile_site_key;
  }
  const secret = text(data, "turnstile_secret");
  if (secret) body.turnstile_secret = secret;
  return { ok: true, value: body };
}

/** Fixed codes the page maps to text, so no message is reflected from a URL. */
export const SITE_NOTICES = {
  "site-created": { tone: "ok", text: "Site created." },
  "site-updated": { tone: "ok", text: "Site updated." },
  "site-unchanged": { tone: "ok", text: "Nothing to change on that site." },
  "secret-cleared": { tone: "ok", text: "Turnstile secret cleared." },
  "site-invalid": {
    tone: "problem",
    text: "That site input was not accepted. Check the fields and try again.",
  },
  "site-conflict": {
    tone: "problem",
    text: "That site key is already in use. Keys are unique across Barrels and permanent.",
  },
  "secret-storage": {
    tone: "problem",
    text: "Secret storage is not configured on the server, so a Turnstile secret cannot be saved or cleared. Ask an operator to set ORG_SECRET_ENCRYPTION_KEYS on the API, then try again. Nothing was changed.",
  },
  "site-failed": {
    tone: "problem",
    text: "The site change could not be saved. Nothing was changed.",
  },
} as const;

export type SiteNoticeCode = keyof typeof SITE_NOTICES;

export function siteNoticeFor(
  code: string | undefined
): (typeof SITE_NOTICES)[SiteNoticeCode] | undefined {
  return code && Object.hasOwn(SITE_NOTICES, code)
    ? SITE_NOTICES[code as SiteNoticeCode]
    : undefined;
}

export function siteNoticeForStatus(status: number): SiteNoticeCode {
  if (status === 409) return "site-conflict";
  if (status === 503) return "secret-storage";
  if (status === 400 || status === 422) return "site-invalid";
  return "site-failed";
}
