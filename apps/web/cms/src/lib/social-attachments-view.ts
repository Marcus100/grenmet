import { recognizeLink } from "@barrelsgd/gms/link-recognition";

/** The generated files GMS keeps for every published warning (CAP attachments). */
export const ATTACHMENT_KINDS = ["social", "pdf", "map"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** The staff-only download address a Social sharing button points at. */
export function attachmentHref(
  identifier: string,
  kind: AttachmentKind
): string {
  const query = new URLSearchParams({ identifier, kind });
  return `/api/social-attachment?${query.toString()}`;
}

const ROW_URL = /^relatedLinks\.(\d+)\.url$/;

export type Fields = Record<string, { value?: unknown } | undefined>;

/** The main related link's address, read from the form as it is being edited. */
export function mainLinkUrl(fields: Fields): string | null {
  for (const key of Object.keys(fields)) {
    const row = key.match(ROW_URL)?.[1];
    if (row === undefined) continue;
    if (fields[`relatedLinks.${row}.isMain`]?.value !== true) continue;
    const url = fields[key]?.value;
    return typeof url === "string" && url.trim() ? url : null;
  }
  return null;
}

/** What the panel shows for the form as it is being edited. */
export type AttachmentsView =
  | { identifier: string; kind: "downloads" }
  | { kind: "product" }
  | { kind: "none" };

export function attachmentsView(fields: Fields): AttachmentsView {
  const url = mainLinkUrl(fields);
  const link = url ? recognizeLink(url) : null;
  if (link?.type === "cap" && link.ref)
    return { kind: "downloads", identifier: link.ref };
  return link?.type === "product" ? { kind: "product" } : { kind: "none" };
}
