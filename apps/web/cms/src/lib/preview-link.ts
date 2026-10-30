import { createHmac, timingSafeEqual } from "node:crypto";

/** Editorial collections a reader can preview before they are published. */
export const PREVIEW_COLLECTIONS = [
  "desk-updates",
  "stories",
  "report-notes",
  "questions",
  "live-posts",
] as const;
export type PreviewCollection = (typeof PREVIEW_COLLECTIONS)[number];

/** A preview link works for two hours, then the editor asks for a new one. */
export const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

export const isPreviewCollection = (
  value: unknown
): value is PreviewCollection =>
  PREVIEW_COLLECTIONS.some((name) => name === value);

/**
 * The signing key is derived from `PAYLOAD_SECRET` with a purpose label, so
 * the raw secret never signs anything directly and preview tokens cannot be
 * reused for another purpose. No new secret is stored in code or config.
 */
function signatureFor(secret: string, body: string): string {
  const key = createHmac("sha256", secret)
    .update("gms-cms:preview-link:v1")
    .digest();
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** A short-lived token that names one document and nothing else. */
export function signPreviewToken({
  collection,
  id,
  now = new Date(),
  secret,
}: {
  collection: PreviewCollection;
  id: string | number;
  now?: Date;
  secret: string;
}): string {
  const body = Buffer.from(
    JSON.stringify({
      c: collection,
      i: String(id),
      e: now.getTime() + PREVIEW_TTL_MS,
    })
  ).toString("base64url");
  return `${body}.${signatureFor(secret, body)}`;
}

/** The document a token names, or null if it is forged, expired or malformed. */
export function readPreviewToken(
  token: string,
  { now = new Date(), secret }: { now?: Date; secret: string }
): { collection: PreviewCollection; id: string } | null {
  const parts = token.split(".");
  const [body, signature] = parts;
  if (parts.length !== 2 || !body || !signature) return null;
  const expected = Buffer.from(signatureFor(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object") return null;
  const { c, i, e } = claims as Record<string, unknown>;
  if (!isPreviewCollection(c) || typeof i !== "string" || !i) return null;
  if (typeof e !== "number" || e <= now.getTime()) return null;
  return { collection: c, id: i };
}

/** The reader-facing preview address for a document, or null if not configured. */
export function previewHref({
  collection,
  id,
  now,
  secret,
  siteUrl,
}: {
  collection: PreviewCollection;
  id: string | number;
  now?: Date;
  secret: string;
  siteUrl: string | undefined;
}): string | null {
  if (!siteUrl) return null;
  const url = new URL(siteUrl);
  url.searchParams.set(
    "token",
    signPreviewToken({ collection, id, now, secret })
  );
  return url.toString();
}
