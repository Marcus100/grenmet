// Validation for the "Invite superuser" form (ADR-0059 rule 1). The API owns the rules
// and repeats them; this only refuses obvious mistakes before a round trip and keeps
// the typed values for the form. The reason is audited, never mailed.

export const REASON_MIN = 10;
export const REASON_MAX = 500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MAX_EMAIL = 320;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface InviteFormValues {
  email: string;
  reason: string;
}

export type InviteParse =
  | { ok: true; value: InviteFormValues; values: InviteFormValues }
  | { ok: false; message: string; values: InviteFormValues };

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Trimmed values, as typed, for keeping the form intact after a refusal. */
export function collectInviteValues(formData: FormData): InviteFormValues {
  return {
    email: read(formData, "email").trim(),
    reason: read(formData, "reason").trim(),
  };
}

export function parseSuperuserInvite(formData: FormData): InviteParse {
  const values = collectInviteValues(formData);
  if (!EMAIL.test(values.email) || values.email.length > MAX_EMAIL) {
    return {
      ok: false,
      message: "Enter the email address of the person you are inviting.",
      values,
    };
  }
  if (values.reason.includes("\u0000")) {
    return {
      ok: false,
      message: "The reason contains a character that is not allowed.",
      values,
    };
  }
  if (values.reason.length < REASON_MIN || values.reason.length > REASON_MAX) {
    return {
      ok: false,
      message: `The reason must be ${REASON_MIN} to ${REASON_MAX} characters.`,
      values,
    };
  }
  return { ok: true, value: values, values };
}

export function isInvitationId(value: string): boolean {
  return UUID.test(value);
}

/** Fixed notice codes from the redirect. Nothing typed is ever reflected from a URL. */
export const SUPERUSER_NOTICES: Record<string, string> = {
  invited:
    "Invitation sent. It works for 24 hours, and every administrator was emailed.",
  revoked: "Invitation revoked. It can no longer be accepted.",
  "revoke-failed":
    "The invitation could not be revoked. Nothing changed. Try again.",
  "already-closed": "That invitation had already ended.",
  "not-found": "That invitation no longer exists.",
};

export function superuserNoticeFor(code: string | undefined): string | null {
  return code && Object.hasOwn(SUPERUSER_NOTICES, code)
    ? (SUPERUSER_NOTICES[code] ?? null)
    : null;
}
