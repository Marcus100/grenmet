import { linkablePage } from "@barrelsgd/gms/linkable-pages";
import { isProductKind, productTitle } from "@barrelsgd/gms/products";
import type { EditorialLink, LinkCategory } from "./editorial-links";

type Fetcher = typeof fetch;

const TIMEOUT_MS = 3000;
const FORECAST_KINDS = new Set(["morning", "midday", "evening", "outlook"]);
/** An issued product's id: a UUID, the only form the product feed uses. */
const PRODUCT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * A CAP identifier: `urn:grenmet:cap:<uuid>`, `urn:oid:<oid>:<uuid>` or a
 * plain token such as `GMS-1`. It starts with a letter or digit and has no
 * slash, percent sign, query, hash or dot segment, so it cannot change the
 * path it is placed in.
 */
const CAP_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/;

export interface LinkLabel {
  category: LinkCategory;
  title: string;
}

/**
 * What a related link points at now. `gone`: the product or warning is
 * withdrawn or was never issued (the forecast system answered 404), or a GMS
 * page no longer exists. `unknown`: the forecast system could not be asked, so
 * nothing is claimed either way.
 */
export type LinkState = "ok" | "gone" | "unknown";
export interface LinkCheck {
  label: LinkLabel;
  state: LinkState;
}

interface Reply {
  body: unknown;
  ok: boolean;
  status?: number;
}

/** The forecast system's answer, or null when it could not be reached. */
async function getJson(fetcher: Fetcher, url: URL): Promise<Reply | null> {
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { body: null, ok: false, status: response.status };
    return { body: await response.json(), ok: true, status: response.status };
  } catch {
    return null;
  }
}

/** "Evening Forecast · issued 2026-10-27 18:00", from the product's own fields. */
async function productCheck(
  baseURL: string,
  id: string,
  fetcher: Fetcher
): Promise<LinkCheck> {
  const fallback: LinkLabel = { title: "Issued product", category: "forecast" };
  // A ref that is not a UUID was never issued; nothing is requested for it.
  if (!PRODUCT_ID.test(id)) return { label: fallback, state: "gone" };
  const reply = await getJson(
    fetcher,
    new URL(`/api/v1/wxproducts/public/products/${id}`, baseURL)
  );
  // Withdrawn or unknown products are 404 on the public product feed.
  if (reply?.status === 404) return { label: fallback, state: "gone" };
  if (!reply?.ok) return { label: fallback, state: "unknown" };
  const body = reply.body as {
    kind?: string;
    values?: Record<string, string>;
  } | null;
  if (!(body?.kind && isProductKind(body.kind)))
    return { label: fallback, state: "ok" };
  const issued = body.values?.issuedAt?.replace("T", " ");
  return {
    label: {
      title: issued
        ? `${productTitle(body.kind)} · issued ${issued}`
        : productTitle(body.kind),
      category: FORECAST_KINDS.has(body.kind) ? "forecast" : "bulletin",
    },
    state: "ok",
  };
}

/** A warning's headline, from its public CAP record. */
async function warningCheck(
  baseURL: string,
  identifier: string,
  fetcher: Fetcher
): Promise<LinkCheck> {
  const fallback: LinkLabel = { title: "CAP warning", category: "cap" };
  // A malformed identifier names no warning, so no request is built from it.
  if (!CAP_IDENTIFIER.test(identifier))
    return { label: fallback, state: "gone" };
  const reply = await getJson(
    fetcher,
    new URL(`/api/cap/alerts/${encodeURIComponent(identifier)}`, baseURL)
  );
  // The public CAP record only finds published alerts; others are 404.
  if (reply?.status === 404) return { label: fallback, state: "gone" };
  if (!reply?.ok) return { label: fallback, state: "unknown" };
  const body = reply.body as {
    info?: { headline?: string | null; event?: string | null }[];
  } | null;
  const info = body?.info?.[0];
  const title = info?.headline || info?.event;
  return {
    label: title ? { title, category: "cap" } : fallback,
    state: "ok",
  };
}

/**
 * Titles, categories and whether a link still works. A product or warning is
 * read from the forecast system, a page from the site's own menu, an outside
 * link from its host name (never checked). Always returns something.
 */
export function checkLink(
  link: EditorialLink,
  baseURL: string,
  fetcher: Fetcher = fetch
): Promise<LinkCheck> {
  if (link.type === "product" && link.ref)
    return productCheck(baseURL, link.ref, fetcher);
  if (link.type === "cap" && link.ref)
    return warningCheck(baseURL, link.ref, fetcher);
  if (link.type === "page" && link.ref) {
    const page = linkablePage(link.ref);
    return Promise.resolve({
      label: { title: page?.title ?? link.ref, category: "article" },
      state: page ? "ok" : "gone",
    });
  }
  const host = URL.canParse(link.url) ? new URL(link.url).hostname : link.url;
  return Promise.resolve({
    label: { title: host, category: "source" },
    state: "ok",
  });
}

/**
 * A title and category for a link the editor left blank. Always returns
 * something; see `checkLink` for the full answer.
 */
export async function labelFor(
  link: EditorialLink,
  baseURL: string,
  fetcher: Fetcher = fetch
): Promise<LinkLabel> {
  return (await checkLink(link, baseURL, fetcher)).label;
}
