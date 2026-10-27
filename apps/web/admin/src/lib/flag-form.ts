/**
 * Validation for the feature-flag form. Pure functions over `FormData`,
 * unit-tested without a server; FastAPI re-validates and owns the success
 * metric rule. Audience ids are free text split on commas and whitespace.
 */

import type {
  Environment,
  FeatureFlagAdmin,
  FeatureFlagAudience,
  FeatureFlagCreate,
  FeatureFlagUpdate,
} from "@barrelsgd/api-client";
import type { Parsed } from "@/lib/organisation-form";

export const FLAG_ENVIRONMENTS = [
  "local",
  "staging",
  "production",
] as const satisfies readonly Environment[];

export const FLAG_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_FLAG_KEY = 80;
const FLAG_ID = /^[A-Za-z0-9_-]{1,100}$/;
const ORG_ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERCENT = /^\d{1,3}$/;
const SPLIT = /[\s,]+/;
const MAX_DESCRIPTION = 2000;
const MAX_METRIC = 4000;
const MAX_OWNER = 255;
const MAX_ORG_IDS = 200;
const MAX_USER_IDS = 500;
const MAX_PERCENT = 100;
const DATE_PREFIX = 10;

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseFlagId(value: string): string | undefined {
  return FLAG_ID.test(value) ? value : undefined;
}

export function splitIds(value: string): string[] {
  return [...new Set(value.split(SPLIT).filter(Boolean))];
}

/** "2026-12-31" -> an ISO instant at midnight UTC; undefined when not a date. */
export function dateToInstant(value: string): string | undefined {
  if (!DATE.test(value)) return;
  const instant = `${value}T00:00:00Z`;
  const parsed = new Date(instant);
  // Round-trip so an impossible day such as 2026-02-30 is refused.
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, DATE_PREFIX) !== value
    ? undefined
    : instant;
}

export function instantToDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, DATE_PREFIX) : "";
}

function parsePercentage(raw: string): Parsed<number | null> {
  if (!raw) return { ok: true, value: null };
  const percentage = PERCENT.test(raw) ? Number.parseInt(raw, 10) : -1;
  if (percentage < 0 || percentage > MAX_PERCENT) return { ok: false };
  return { ok: true, value: percentage };
}

function parseAudience(data: FormData): Parsed<FeatureFlagAudience> {
  const organisationIds = splitIds(text(data, "organisation_ids"));
  const userIds = splitIds(text(data, "user_ids"));
  const percentage = parsePercentage(text(data, "percentage"));
  if (
    !percentage.ok ||
    organisationIds.length > MAX_ORG_IDS ||
    userIds.length > MAX_USER_IDS ||
    !organisationIds.every((id) => ORG_ID.test(id)) ||
    !userIds.every((id) => UUID.test(id))
  ) {
    return { ok: false };
  }
  const chosen = data.getAll("environments");
  return {
    ok: true,
    value: {
      everyone: data.get("everyone") === "on",
      organisation_ids: organisationIds,
      user_ids: userIds,
      percentage: percentage.value,
      environments: FLAG_ENVIRONMENTS.filter((env) => chosen.includes(env)),
    },
  };
}

interface FlagSettings {
  audience: FeatureFlagAudience;
  description: string;
  enabled: boolean;
  expires_at: string | null;
  exposed: boolean;
  owner: string | null;
  review_by: string | null;
  success_metric: string | null;
}

function optionalInstant(raw: string): Parsed<string | null> {
  if (!raw) return { ok: true, value: null };
  const instant = dateToInstant(raw);
  return instant ? { ok: true, value: instant } : { ok: false };
}

function parseSettings(data: FormData): Parsed<FlagSettings> {
  const description = text(data, "description");
  const metric = text(data, "success_metric");
  const owner = text(data, "owner");
  const audience = parseAudience(data);
  const expiresAt = optionalInstant(text(data, "expires_at"));
  const reviewBy = optionalInstant(text(data, "review_by"));
  if (
    !(audience.ok && expiresAt.ok && reviewBy.ok) ||
    description.length > MAX_DESCRIPTION ||
    metric.length > MAX_METRIC ||
    owner.length > MAX_OWNER
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      description,
      enabled: data.get("enabled") === "on",
      exposed: data.get("exposed") === "on",
      audience: audience.value,
      success_metric: metric || null,
      owner: owner || null,
      expires_at: expiresAt.value,
      review_by: reviewBy.value,
    },
  };
}

export function parseFlagCreate(data: FormData): Parsed<FeatureFlagCreate> {
  const key = text(data, "key");
  if (!(FLAG_KEY.test(key) && key.length <= MAX_FLAG_KEY)) return { ok: false };
  const settings = parseSettings(data);
  if (!settings.ok) return settings;
  return { ok: true, value: { key, ...settings.value } };
}

function sortedKey(values: readonly string[] | undefined): string {
  return [...(values ?? [])].sort().join(",");
}

function sameAudience(a: FeatureFlagAudience, b: FeatureFlagAudience) {
  return (
    Boolean(a.everyone) === Boolean(b.everyone) &&
    (a.percentage ?? null) === (b.percentage ?? null) &&
    sortedKey(a.organisation_ids) === sortedKey(b.organisation_ids) &&
    sortedKey(a.user_ids) === sortedKey(b.user_ids) &&
    sortedKey(a.environments) === sortedKey(b.environments)
  );
}

/** Only what differs from the stored flag, so untouched fields keep their value. */
export function parseFlagUpdate(
  data: FormData,
  current: FeatureFlagAdmin
): Parsed<FeatureFlagUpdate> {
  const settings = parseSettings(data);
  if (!settings.ok) return settings;
  const next = settings.value;
  const body: FeatureFlagUpdate = {};
  if (next.description !== current.description) {
    body.description = next.description;
  }
  if (next.enabled !== current.enabled) body.enabled = next.enabled;
  if (next.exposed !== current.exposed) body.exposed = next.exposed;
  if (!sameAudience(next.audience, current.audience)) {
    body.audience = next.audience;
  }
  if (next.success_metric !== (current.success_metric ?? null)) {
    body.success_metric = next.success_metric;
  }
  if (next.owner !== (current.owner ?? null)) body.owner = next.owner;
  // Dates compare by day: the form cannot carry a time of day.
  if (instantToDate(next.expires_at) !== instantToDate(current.expires_at)) {
    body.expires_at = next.expires_at;
  }
  if (instantToDate(next.review_by) !== instantToDate(current.review_by)) {
    body.review_by = next.review_by;
  }
  return { ok: true, value: body };
}

/** Plain-language audience summary for the list. */
export function audienceSummary(audience: FeatureFlagAudience): string {
  const parts: string[] = [];
  if (audience.everyone) parts.push("Everyone");
  const orgs = audience.organisation_ids?.length ?? 0;
  if (orgs > 0) parts.push(`${orgs} organisation${orgs === 1 ? "" : "s"}`);
  const users = audience.user_ids?.length ?? 0;
  if (users > 0) parts.push(`${users} user${users === 1 ? "" : "s"}`);
  if (audience.percentage !== null && audience.percentage !== undefined) {
    parts.push(`${audience.percentage}% rollout`);
  }
  if (parts.length === 0) parts.push("Nobody");
  const envs = audience.environments ?? [];
  const scope = envs.length > 0 ? ` (only in ${envs.join(", ")})` : "";
  return `${parts.join(", ")}${scope}`;
}

/** What `useActionState` holds; `values` lets the form keep what was typed. */
export interface FlagFormState {
  message?: string;
  values?: Record<string, string | string[]>;
}

export function collectValues(
  data: FormData
): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(data.keys())) {
    const all = data
      .getAll(key)
      .filter((item): item is string => typeof item === "string");
    values[key] = key === "environments" ? all : (all[0] ?? "");
  }
  return values;
}

export const FLAG_NOTICES = {
  "flag-created": { tone: "ok", text: "Flag created." },
  "flag-updated": { tone: "ok", text: "Flag updated." },
  "flag-unchanged": { tone: "ok", text: "Nothing to change on that flag." },
  "flag-deleted": { tone: "ok", text: "Flag deleted." },
  "flag-missing": { tone: "problem", text: "That flag no longer exists." },
  "flag-failed": {
    tone: "problem",
    text: "The flag change could not be saved. Nothing was changed.",
  },
} as const;

export type FlagNoticeCode = keyof typeof FLAG_NOTICES;

export function flagNoticeFor(
  code: string | undefined
): (typeof FLAG_NOTICES)[FlagNoticeCode] | undefined {
  return code && Object.hasOwn(FLAG_NOTICES, code)
    ? FLAG_NOTICES[code as FlagNoticeCode]
    : undefined;
}
