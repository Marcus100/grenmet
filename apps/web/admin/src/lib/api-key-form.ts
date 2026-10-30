/**
 * Fixed notice codes for the API key panel on the organisation page. Keys are
 * created and rotated by organisation admins (org zone); the control plane can
 * only list and revoke, so there is no secret to handle here.
 */

const KEY_ID = /^[A-Za-z0-9_-]{1,100}$/u;

export function parseApiKeyId(value: string): string | undefined {
  return KEY_ID.test(value) ? value : undefined;
}

export const API_KEY_NOTICES = {
  "key-revoked": {
    tone: "ok",
    text: "API key revoked. It stopped working at once.",
  },
  "key-missing": { tone: "problem", text: "That API key no longer exists." },
  "key-failed": {
    tone: "problem",
    text: "The API key could not be revoked. Nothing was changed.",
  },
} as const;

export type ApiKeyNoticeCode = keyof typeof API_KEY_NOTICES;

export function apiKeyNoticeFor(
  code: string | undefined
): (typeof API_KEY_NOTICES)[ApiKeyNoticeCode] | undefined {
  return code && Object.hasOwn(API_KEY_NOTICES, code)
    ? API_KEY_NOTICES[code as ApiKeyNoticeCode]
    : undefined;
}

export type KeyState = "active" | "expired" | "revoked";

/** Revoked beats expired; `now` is injected so the rule is testable. */
export function keyState(
  key: { expires_at?: string | null; revoked_at?: string | null },
  now: Date
): KeyState {
  if (key.revoked_at) return "revoked";
  if (key.expires_at && new Date(key.expires_at) <= now) return "expired";
  return "active";
}
