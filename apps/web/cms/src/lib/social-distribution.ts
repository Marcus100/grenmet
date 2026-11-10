import type { CollectionAfterChangeHook, Payload } from "payload";
import { getEnv } from "../env";
import {
  isSiteCollection,
  type SiteCollection,
  siteAddress,
  sitePath,
} from "./gms-site";
import { isLive } from "./publication-status";

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

/** The per-platform picture field on a post, by platform. */
const PLATFORM_IMAGE_FIELD: Record<SocialPlatform, string> = {
  facebook: "facebookImage",
  instagram: "instagramImage",
  whatsapp: "whatsappImage",
};

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

/** The supported platforms chosen on a post, in the order they were picked. */
export function chosenPlatforms(doc: Doc): SocialPlatform[] {
  const social = (doc.social ?? {}) as Doc;
  const chosen = Array.isArray(social.enabledPlatforms)
    ? social.enabledPlatforms
    : [];
  const platforms = chosen.flatMap((label) =>
    typeof label === "string" && label in PLATFORM_KEYS
      ? [PLATFORM_KEYS[label as keyof typeof PLATFORM_KEYS]]
      : []
  );
  return [...new Set(platforms)];
}

/**
 * The image sources for one platform, first to last: its own picture, the
 * general social image, then the cover (owner, 1 Nov 2026).
 */
export function imageSources(doc: Doc, platform: SocialPlatform): unknown[] {
  const social = (doc.social ?? {}) as Doc;
  return [social[PLATFORM_IMAGE_FIELD[platform]], social.image, doc.image];
}

/**
 * One request body per chosen platform, so each platform gets its own picture.
 * FastAPI keys a post by platform, so splitting does not change deduplication.
 * Empty when no supported platform is chosen.
 */
export function distributionBodies({
  collection,
  doc,
  imageUrls,
  origin,
}: {
  collection: SiteCollection;
  doc: Doc;
  imageUrls: Partial<Record<SocialPlatform, string | null>>;
  origin: string;
}): DistributionBody[] {
  const social = (doc.social ?? {}) as Doc;
  const slug = String(doc.slug);
  const url = siteAddress(origin, sitePath(collection, slug));
  const captions = {
    facebook: text(social.facebookText),
    instagram: text(social.instagramText),
    whatsapp: text(social.whatsappText),
  };
  const publishAt =
    typeof social.publishAt === "string" ? social.publishAt : null;
  return chosenPlatforms(doc).map((platform) => ({
    collection,
    slug,
    url,
    title: String(doc.title ?? ""),
    summary: String(doc.summary ?? ""),
    captions,
    platforms: [platform],
    publishAt,
    imageUrl: imageUrls[platform] ?? null,
  }));
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
 * The picture each platform will receive. One lookup per media item, however
 * many platforms share it; a platform with none gets null.
 */
async function platformImageUrls(
  doc: Doc,
  platforms: SocialPlatform[],
  {
    cmsUrl,
    lookupImage,
    payload,
  }: {
    cmsUrl: string;
    lookupImage?: (id: unknown) => Promise<string | null>;
    payload?: Payload;
  }
): Promise<Partial<Record<SocialPlatform, string | null>>> {
  const seen = new Map<unknown, Promise<string | null>>();
  const resolve = (id: unknown): Promise<string | null> => {
    const cached = seen.get(id);
    if (cached) return cached;
    let pending = Promise.resolve<string | null>(null);
    if (lookupImage) pending = lookupImage(id);
    else if (payload) pending = imageAddress(payload, id, cmsUrl);
    seen.set(id, pending);
    return pending;
  };
  const urls: Partial<Record<SocialPlatform, string | null>> = {};
  for (const platform of platforms) {
    urls[platform] = null;
    for (const source of imageSources(doc, platform)) {
      if (source === null || source === undefined) continue;
      const url = await resolve(source);
      if (url) {
        urls[platform] = url;
        break;
      }
    }
  }
  return urls;
}

/**
 * The whole decision: send only when a publisher approved the post, it is
 * published, the distribution secret and the weather site's address are set,
 * and at least one supported platform is chosen. Each platform gets its own
 * request with its own image (the first source that resolves). A failed
 * request is reported and never blocks publishing. Never throws.
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
    if (!isLive(doc) || social.approveForSocial !== true) return "skipped";
    const platforms = chosenPlatforms(doc);
    const imageUrls = await platformImageUrls(doc, platforms, {
      cmsUrl: env.CMS_URL,
      lookupImage,
      payload,
    });
    const bodies = distributionBodies({
      collection: slug,
      doc,
      imageUrls,
      origin,
    });
    if (bodies.length === 0) return "skipped";
    const results = await Promise.allSettled(
      bodies.map((body) =>
        sendDistribution(body, {
          apiUrl: env.AUTH_API_URL,
          fetchImpl,
          secret,
        })
      )
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length > 0) {
      // Loaded lazily: the payload config imports this module, and migrations
      // load that config without Sentry (see lib/report-payload-error.ts).
      const { reportError } = await import("./report-error");
      for (const failure of failures)
        reportError(failure, "cms-social-distribution");
    }
    return results.length > failures.length ? "sent" : "skipped";
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
