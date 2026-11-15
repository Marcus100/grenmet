// The Settings side of the business's contact options (phone, WhatsApp,
// Instagram, email). Checks what the studio typed with the same rules as the
// API (apps/api/fastapi/src/bookings/contact.py) so a mistake is pointed at
// the field before any call; the API still checks and normalises again.

import { z } from "zod";

export type ContactField =
  | "contactPhone"
  | "contactWhatsapp"
  | "contactInstagram"
  | "contactEmail";

export type ContactFieldErrors = Partial<Record<ContactField, string>>;

export interface ContactBody {
  contact_email: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
}

export const CONTACT_FIELDS: readonly ContactField[] = [
  "contactPhone",
  "contactWhatsapp",
  "contactInstagram",
  "contactEmail",
];

export const CONTACT_MESSAGES: Record<ContactField, string> = {
  contactPhone:
    "Enter the phone number with its country code, for example +1 473 440 1234.",
  contactWhatsapp:
    "Enter the WhatsApp number with its country code, for example +1 473 440 1234.",
  contactInstagram:
    "Enter an Instagram handle (letters, numbers, dots and underscores, at most 30) or an instagram.com profile address.",
  contactEmail: "That contact email does not look right.",
};

const API_FIELD: Record<string, ContactField> = {
  contact_phone: "contactPhone",
  contact_whatsapp: "contactWhatsapp",
  contact_instagram: "contactInstagram",
  contact_email: "contactEmail",
};

const SEPARATORS = /[\s().-]/gu;
const E164 = /^\+[1-9]\d{6,14}$/u;
const WHATSAPP = /^[1-9]\d{6,14}$/u;
const HANDLE = /^[A-Za-z0-9._]{1,30}$/u;
const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

/** Null for blank, the stored form, or undefined when it is not valid. */
type Normalised = string | null | undefined;

export function normalisePhone(raw: string): Normalised {
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  let compact = text.replace(SEPARATORS, "");
  if (compact.startsWith("00")) {
    compact = `+${compact.slice(2)}`;
  }
  return E164.test(compact) ? compact : undefined;
}

export function normaliseWhatsapp(raw: string): Normalised {
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  let compact = text.replace(SEPARATORS, "");
  if (compact.startsWith("+")) {
    compact = compact.slice(1);
  } else if (compact.startsWith("00")) {
    compact = compact.slice(2);
  }
  return WHATSAPP.test(compact) ? compact : undefined;
}

function handleFromAddress(text: string): Normalised {
  let address: URL;
  try {
    address = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!INSTAGRAM_HOSTS.has(address.hostname.toLowerCase())) {
    return undefined;
  }
  const segments = address.pathname.split("/").filter(Boolean);
  return segments.length === 1 ? segments[0] : undefined;
}

export function normaliseInstagram(raw: string): Normalised {
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  const handle = text.toLowerCase().includes("instagram.com")
    ? handleFromAddress(text)
    : text;
  if (handle === undefined || handle === null) {
    return undefined;
  }
  const bare = handle.startsWith("@") ? handle.slice(1) : handle;
  return HANDLE.test(bare) ? bare : undefined;
}

export function normaliseEmail(raw: string): Normalised {
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  return text.length <= 254 && z.email().safeParse(text).success
    ? text
    : undefined;
}

const NORMALISE: Record<ContactField, (raw: string) => Normalised> = {
  contactPhone: normalisePhone,
  contactWhatsapp: normaliseWhatsapp,
  contactInstagram: normaliseInstagram,
  contactEmail: normaliseEmail,
};

/** The four typed values as the API body, or a message for each wrong one. */
export function checkContacts(
  values: Record<ContactField, string>
): { ok: true; body: ContactBody } | { ok: false; fields: ContactFieldErrors } {
  const fields: ContactFieldErrors = {};
  const stored: Partial<Record<ContactField, string | null>> = {};
  for (const key of CONTACT_FIELDS) {
    const value = NORMALISE[key](values[key]);
    if (value === undefined) {
      fields[key] = CONTACT_MESSAGES[key];
    } else {
      stored[key] = value;
    }
  }
  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    body: {
      contact_phone: stored.contactPhone ?? null,
      contact_whatsapp: stored.contactWhatsapp ?? null,
      contact_instagram: stored.contactInstagram ?? null,
      contact_email: stored.contactEmail ?? null,
    },
  };
}

/**
 * The API's request-validation errors for the contact fields (each item's
 * `loc` ends in the API field name), worded as the form words them.
 */
export function contactFieldErrors(
  data: unknown
): ContactFieldErrors | undefined {
  if (
    typeof data !== "object" ||
    data === null ||
    !("errors" in data) ||
    !Array.isArray(data.errors)
  ) {
    return undefined;
  }
  const fields: ContactFieldErrors = {};
  for (const item of data.errors as unknown[]) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("loc" in item) ||
      !Array.isArray(item.loc)
    ) {
      continue;
    }
    const location: unknown[] = item.loc;
    const part = location.find(
      (value): value is string =>
        typeof value === "string" && value in API_FIELD
    );
    const key = part === undefined ? undefined : API_FIELD[part];
    if (key) {
      fields[key] = CONTACT_MESSAGES[key];
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}
