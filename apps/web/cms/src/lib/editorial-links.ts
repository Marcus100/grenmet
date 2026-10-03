import { z } from "zod";

export const editorialLinkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum([
    "forecast",
    "cap",
    "aviation",
    "bulletin",
    "publication",
    "article",
    "source",
  ]),
  url: z
    .url()
    .max(2000)
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    }, "Use a full HTTP or HTTPS URL without credentials."),
});

export const editorialLinksSchema = z
  .array(editorialLinkSchema)
  .max(20)
  .refine(
    (links) => new Set(links.map((link) => link.url)).size === links.length,
    "Use each destination once."
  );
