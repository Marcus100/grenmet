import { recognizeLink } from "@barrelsgd/gms/link-recognition";
import { z } from "zod";

export const LINK_CATEGORIES = [
  "forecast",
  "cap",
  "aviation",
  "bulletin",
  "publication",
  "article",
  "source",
] as const;
export type LinkCategory = (typeof LINK_CATEGORIES)[number];

/** A full HTTP(S) address without credentials, or a path on the GMS site. */
function isLinkAddress(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
  );
}

/** What each kind of link falls back to when the editor leaves it blank. */
const DEFAULT_CATEGORY = {
  product: "forecast",
  cap: "cap",
  page: "article",
  link: "source",
} as const satisfies Record<string, LinkCategory>;

const rawLinkSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  category: z.enum(LINK_CATEGORIES).nullish(),
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine(
      isLinkAddress,
      "Paste a full HTTP or HTTPS address, or a page on the GMS site."
    ),
  isMain: z.boolean().nullish(),
});

/** One related link, with what it points at worked out from its address. */
export const editorialLinkSchema = rawLinkSchema.transform((row) => {
  const { type, ref } = recognizeLink(row.url);
  return {
    title: row.title?.trim() ?? "",
    category: row.category ?? DEFAULT_CATEGORY[type],
    url: row.url,
    type,
    ref,
    isMain: row.isMain === true,
  };
});
export type EditorialLink = z.infer<typeof editorialLinkSchema>;

/** The place a link points to, so the same page is not listed twice. */
const destination = (link: EditorialLink) =>
  link.ref ? `${link.type}:${link.ref}` : link.url;

export const editorialLinksSchema = z
  .array(editorialLinkSchema)
  .max(20)
  .refine(
    (links) => new Set(links.map(destination)).size === links.length,
    "Use each destination once."
  )
  .refine(
    (links) => links.filter((link) => link.isMain).length <= 1,
    "Only one link can be the main link."
  )
  .refine(
    (links) => links.every((link) => !link.isMain || link.type !== "link"),
    "The main link must be a GMS product, warning or page, not an outside link."
  );
