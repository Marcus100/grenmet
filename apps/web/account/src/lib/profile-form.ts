import { isAuthApiError } from "@barrelsgd/auth";

/** What a profile form shows after a save was refused. */
export interface ProfileFormState<Field extends string> {
  /** One sentence beside the field it is about. */
  fieldErrors: Partial<Record<Field, string>>;
  /** A sentence about the whole form (the save failed, sign in again). */
  formError: string | null;
  /** What the person typed, so a refused form is not emptied. */
  values: Record<Field, string>;
}

/** Pydantic puts this in front of a message a validator raised. */
const VALUE_ERROR_PREFIX = "Value error, ";

/** A text field of the form, trimmed; empty when missing or a file. */
export function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The API's field messages of a 422, for the named fields only. The API writes
 * these sentences for people; anything about another field is ignored.
 */
export function apiFieldErrors<Field extends string>(
  error: unknown,
  fields: readonly Field[]
): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string>> = {};
  if (!(isAuthApiError(error) && error.status === 422)) return found;
  for (const item of error.errors) {
    const field = fields.find((name) => item.loc.includes(name));
    if (field === undefined || found[field] !== undefined) continue;
    found[field] = item.msg.startsWith(VALUE_ERROR_PREFIX)
      ? item.msg.slice(VALUE_ERROR_PREFIX.length)
      : item.msg;
  }
  return found;
}

/** True when the API says the session no longer stands (sign in again). */
export function isSignedOut(error: unknown): boolean {
  return (
    isAuthApiError(error) && (error.status === 401 || error.status === 403)
  );
}

export const SIGN_IN_AGAIN =
  "Your sign-in has ended. Sign in again, then save.";

export const NAME_FIELDS = ["first_name", "last_name"] as const;
export type NameFormState = ProfileFormState<(typeof NAME_FIELDS)[number]>;

export const PHONE_FIELDS = ["phone"] as const;
export type PhoneFormState = ProfileFormState<(typeof PHONE_FIELDS)[number]>;

/** The same sentence the API gives for a number it cannot read. */
export const PHONE_HELP =
  "Enter the phone number with its country code, for example +1 473 440 1234";

/** Fixed codes for the "saved" line on the home page; nothing typed is echoed. */
export const SAVED_NOTICES: Readonly<Record<string, string>> = {
  name: "Name saved.",
  phone: "Phone number saved.",
  "phone-removed": "Phone number removed.",
};
