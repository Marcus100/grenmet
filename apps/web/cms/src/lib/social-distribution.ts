import type { CollectionAfterChangeHook, Payload } from "payload";
import { getEnv } from "../env";
import {
  isSiteCollection,
  type SiteCollection,
  siteAddress,
  sitePath,
} from "./gms-site";

/**
 * Sends an approved, published post to FastAPI, which queues it for the
 * social platforms (`src/content_distribution`). Only the three platforms
 * automation covers are sent; X, YouTube and LinkedIn stay copy-and-paste.
 *
 * FastAPI keys each post by `cms:<collection>:<slug>:<platform>`, so sending
 * the same post again (a re-save after a fix) does not post twice.
 */
export const DISTRIBUTION_PATH = "/api/v1/content-distribution/internal/posts";
export const DISTRIBUTION_TIMEOUT_MS = 5000;
const TRAILING_SLASHES = /\/+$/u;

const PLATFORM_KEYS = {
  Facebook: "facebook",
  Instagram: "instagram",
  "WhatsApp Channel": "whatsapp",
} as const;
export type SocialPlatform = (typeof PLATFORM_KEYS)[keyof typeof PLATFORM_KEYS];

export interface DistributionBody {
  captions: Record<SocialPlatform, string | null>;
  collection: SiteCollection;
  imageUrl: string | null;
  platforms: SocialPlatform[];
  publishAt: string | null;
  slug: string;
  summary: string;
  title: string;
  url: string;
}

type Doc = Record<string, unknown>;

const text = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
};

/** The request body for one post, or null when no supported platform is chosen. */
export function distributionBody({
  collection,
  doc,
  imageUrl,
  origin,
}: {
  collection: SiteCollection;
  doc: Doc;
  imageUrl: string | null;
  origin: string;
}): DistributionBody | null {
  const social = (doc.social ?? {}) as Doc;
  const chosen = Array.isArray(social.enabledPlatforms)
    ? social.enabledPlatforms
    : [];
  const platforms = chosen.flatMap((label) =>
    typeof label === "string" && label in PLATFORM_KEYS
      ? [PLATFORM_KEYS[label as keyof typeof PLATFORM_KEYS]]
      : []
  );
  if (platforms.length === 0) return null;
  const slug = String(doc.slug);
  return {
    collection,
    slug,
    url: siteAddress(origin, sitePath(collection, slug)),
    title: String(doc.title ?? ""),
    summary: String(doc.summary ?? ""),
    captions: {
      facebook: text(social.facebookText),
      instagram: text(social.instagramText),
      whatsapp: text(social.whatsappText),
    },
    platforms: [...new Set(platforms)],
    publishAt: typeof social.publishAt === "string" ? social.publishAt : null,
    imageUrl,
  };
}

/** Sends one body. Throws when the request fails or FastAPI refuses it. */
export async function sendDistribution(
  body: DistributionBody,
  {
    apiUrl,
    fetchImpl,
    secret,
  }: { apiUrl: string; fetchImpl: typeof fetch; secret: string }
): Promise<void> {
  const endpoint = `${apiUrl.replace(TRAILING_SLASHES, "")}${DISTRIBUTION_PATH}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CMS-Secret": secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DISTRIBUTION_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(
      `Social distribution refused the post with status ${response.status}`
    );
}

/** The media address, made absolute against the CMS address, or null. */
async function imageAddress(
  payload: Payload,
  id: unknown,
  cmsUrl: string
): Promise<string | null> {
  const key = typeof id === "object" && id ? (id as Doc).id : id;
  if (typeof key !== "number" && typeof key !== "string") return null;
  const media = await payload.findByID({
    collection: "media",
    id: key,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });
  const url = (media as Doc | null)?.url;
  return typeof url === "string" && url
    ? new URL(url, cmsUrl).toString()
    : null;
}

/**
 * The whole decision: send only when a publisher approved the post, it is
 * published, the distribution secret and the weather site's address are set,
 * and at least one supported platform is chosen. Never throws.
 */
export async function distributeApprovedPost({
  doc,
  fetchImpl = fetch,
  lookupImage,
  payload,
  slug,
}: {
  doc: Doc;
  fetchImpl?: typeof fetch;
  lookupImage?: (id: unknown) => Promise<string | null>;
  payload?: Payload;
  slug: string;
}): Promise<"sent" | "skipped"> {
  try {
    const env = getEnv();
    const secret = env.CMS_DISTRIBUTION_SECRET;
    const origin = env.GMS_SITE_URL;
    if (!(secret && origin && isSiteCollection(slug))) return "skipped";
    const social = (doc.social ?? {}) as Doc;
    if (doc.status !== "published" || social.approveForSocial !== true)
      return "skipped";
    const cmsUrl = env.CMS_URL;
    const resolveImage =
      lookupImage ??
      ((id: unknown) => {
        if (!payload) return Promise.resolve(null);
        return imageAddress(payload, id, cmsUrl);
      });
    const imageUrl =
      (await resolveImage(social.image)) ?? (await resolveImage(doc.image));
    const body = distributionBody({
      collection: slug,
      doc,
      imageUrl,
      origin,
    });
    if (!body) return "skipped";
    await sendDistribution(body, {
      apiUrl: env.AUTH_API_URL,
      fetchImpl,
      secret,
    });
    return "sent";
  } catch (error) {
    // Loaded lazily: the payload config imports this module, and migrations
    // load that config without Sentry (see lib/report-payload-error.ts).
    const { reportError } = await import("./report-error");
    reportError(error, "cms-social-distribution");
    return "skipped";
  }
}

/** The editorial collections' afterChange hook. It never blocks publishing. */
export const distributeForSocial =
  (slug: string): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    await distributeApprovedPost({
      doc: doc as Doc,
      payload: req.payload,
      slug,
    });
    return doc;
  };
