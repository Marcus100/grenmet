import "server-only";
import { z } from "zod";
import { contentSchema, type PublishedContent } from "@/lib/cms";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

/**
 * A draft preview. The CMS signs the link (two hours, `PAYLOAD_SECRET`) and
 * checks it; this app holds no secret and never decides a token is valid. A
 * forged, expired or deleted item comes back as the CMS's 404, which reads as
 * `invalid` here.
 */
export type PreviewResult =
  | { status: "ok"; content: PublishedContent; draft: boolean }
  | { status: "invalid" }
  | { status: "unsupported" }
  | { status: "unavailable" };

const PREVIEW_TIMEOUT_MS = 5000;
/** Two base64url parts joined by a dot, as the CMS signs them. Anything else is refused. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,2000}\.[A-Za-z0-9_-]{1,200}$/;

/** The article types the weather site renders as a page. */
const ARTICLE_COLLECTIONS = new Set([
  "desk-updates",
  "stories",
  "report-notes",
]);

const previewSchema = z.object({
  preview: z.object({
    collection: z.string(),
    status: z.string(),
    item: z.unknown(),
  }),
});

/** Reads one draft through the CMS. Never cached; never indexed (see the page). */
export async function fetchPreview(token: string): Promise<PreviewResult> {
  if (!(env.CMS_API_URL && TOKEN_SHAPE.test(token)))
    return { status: "invalid" };
  try {
    const url = new URL("/api/public/preview", env.CMS_API_URL);
    url.searchParams.set("token", token);
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
    });
    if (response.status === 404) return { status: "invalid" };
    if (!response.ok) return { status: "unavailable" };
    const parsed = previewSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-cms-preview-contract");
      return { status: "unavailable" };
    }
    const { collection, status, item } = parsed.data.preview;
    if (!ARTICLE_COLLECTIONS.has(collection)) return { status: "unsupported" };
    const content = contentSchema.safeParse(item);
    if (!content.success) {
      reportError(content.error, "gms-cms-preview-contract");
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      content: content.data,
      draft: status !== "published",
    };
  } catch (error) {
    reportError(error, "gms-cms-preview");
    return { status: "unavailable" };
  }
}
