/**
 * Pure helpers for the "Team and roles" screen: the expiry date conversion and
 * the wording of API refusals. Role bundles carry their own `label` and
 * `description` from the API; `bundleCopy` only names the live grant rows,
 * which carry just a `role_key`, with a readable fallback for a new bundle.
 */

export interface BundleCopy {
  readonly description: string;
  readonly title: string;
}

const BUNDLE_COPY: Readonly<Record<string, BundleCopy>> = {
  "events-door": {
    title: "Door staff",
    description: "Scan and admit tickets at the door.",
  },
  "events-till": {
    title: "Box office",
    description: "Sell tickets at the outlet till.",
  },
  "events-manager": {
    title: "Event manager",
    description:
      "Build and edit events, work the door and the till, and see settlement.",
  },
  "events-refunds": {
    title: "Refunds",
    description: "Issue refunds to ticket buyers.",
  },
  "events-team": {
    title: "Team manager",
    description:
      "Give and take away Events roles for other members, only roles they hold themselves.",
  },
};

const PERMISSION_COPY: Readonly<Record<string, string>> = {
  "events.listings.manage": "Create, edit, publish and cancel events",
  "events.door.scan": "Scan and admit tickets at the door",
  "events.tickets.sell": "Sell tickets at the outlet till",
  "events.settlement.view": "See settlement and sales reports",
  "events.refunds.issue": "Issue refunds",
  "events.team.manage": "Give and take away Events roles for other members",
};

function humanise(key: string): string {
  const words = key.replace(/[-_.]+/gu, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function bundleCopy(roleKey: string): BundleCopy {
  return (
    BUNDLE_COPY[roleKey] ?? {
      title: humanise(roleKey),
      description: "A role defined by this product.",
    }
  );
}

export function permissionLabel(permissionKey: string): string {
  return PERMISSION_COPY[permissionKey] ?? humanise(permissionKey);
}

/** What a role means for a member: the bundle's permissions in plain words. */
export function allowedActions(permissions: readonly string[]): string[] {
  return permissions.map(permissionLabel);
}

const ROLE_KEY = /^[a-z][a-z0-9-]{0,59}$/u;
/** Membership and grant ids are opaque strings; only their shape is checked. */
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,100}$/u;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;

export const isRoleKey = (value: string): boolean => ROLE_KEY.test(value);
export const isOpaqueId = (value: string): boolean => OPAQUE_ID.test(value);

export type Expiry =
  | { readonly error: string; readonly ok: false }
  | { readonly iso: string | null; readonly ok: true };

export const EXPIRY_PAST =
  "Pick a date that is today or later (dates end at 23:59 UTC).";

/**
 * An optional expiry day becomes the last second of that day in UTC. Empty means
 * the role does not expire. A day whose end has passed is refused.
 */
export function expiryFromDate(date: string, now: Date): Expiry {
  const value = date.trim();
  if (value === "") {
    return { ok: true, iso: null };
  }
  const match = DATE_ONLY.exec(value);
  if (!match) {
    return { ok: false, error: EXPIRY_PAST };
  }
  const [, year, month, day] = match;
  const end = new Date(`${value}T23:59:59.000Z`);
  const valid =
    !Number.isNaN(end.getTime()) &&
    end.getUTCFullYear() === Number(year) &&
    end.getUTCMonth() + 1 === Number(month) &&
    end.getUTCDate() === Number(day);
  if (!valid || end.getTime() <= now.getTime()) {
    return { ok: false, error: EXPIRY_PAST };
  }
  return { ok: true, iso: end.toISOString() };
}

/** Today in UTC as `YYYY-MM-DD`, the earliest day the date field offers. */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const UTC_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** A stored instant in UTC, labelled so nobody reads it as local time. */
export function formatUtc(iso: string): string {
  return `${UTC_FORMAT.format(new Date(iso))} UTC`;
}

export const COULDNT_CONFIRM_TEAM =
  "We couldn't confirm that change. Reload the page to see the current roles before trying again.";
export const NOT_FOUND_TEAM =
  "That member or role is no longer there. Reload the page to see the current team.";
export const CHANGED_TOGETHER =
  "Roles for this member changed at the same time. Reload the page and check before trying again.";

/** The API's refusal when the caller may not touch an owner's membership. */
export const OWNER_TOUCH_REFUSED =
  "Your role in this organisation does not allow this";
export const OWNER_ONLY_REMOVE =
  "Only an owner can remove an owner. Ask an owner to do this.";

/** API refusals whose own wording is already plain; shown as sent. */
const KNOWN_DETAILS: ReadonlySet<string> = new Set([
  "You cannot change your own roles",
  "You can only change roles whose permissions you hold yourself",
  "That member already holds this role",
  "This grant cannot outlast your own access to the role",
  "A grant must expire in the future",
  "Your roles in this organisation do not allow this",
  OWNER_TOUCH_REFUSED,
  "This organisation is not entitled to this app",
  "Roles for this member changed at the same time; try again",
  "An organisation must keep at least one owner",
]);

/**
 * Words for a 4xx from the grant, revoke and removal routes. Known messages
 * pass through; other 403/409/422 get a safe sentence; 404 asks for a reload.
 */
export function friendlyTeamError(
  status: number,
  detail: string | null
): string {
  if (status === 404) {
    return NOT_FOUND_TEAM;
  }
  if (detail && KNOWN_DETAILS.has(detail)) {
    return detail ===
      "Roles for this member changed at the same time; try again"
      ? CHANGED_TOGETHER
      : detail;
  }
  if (status === 403) {
    return "Your roles or this organisation's Events access don't allow that.";
  }
  if (status === 409) {
    return CHANGED_TOGETHER;
  }
  if (status === 422) {
    return "That role or date was refused. Check the choices and try again.";
  }
  return COULDNT_CONFIRM_TEAM;
}
