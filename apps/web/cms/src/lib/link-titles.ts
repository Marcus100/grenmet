import { linkablePage } from "@barrelsgd/gms/linkable-pages";
import { isProductKind, productTitle } from "@barrelsgd/gms/products";
import type { EditorialLink, LinkCategory } from "./editorial-links";

type Fetcher = typeof fetch;

const TIMEOUT_MS = 3000;
const FORECAST_KINDS = new Set(["morning", "midday", "evening", "outlook"]);

export interface LinkLabel {
  category: LinkCategory;
  title: string;
}

async function getJson(fetcher: Fetcher, url: URL): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.ok ? response.json() : null;
}

/** "Evening Forecast · issued 2026-10-27 18:00", from the product's own fields. */
async function productLabel(
  baseURL: string,
  id: string,
  fetcher: Fetcher
): Promise<LinkLabel> {
  const fallback: LinkLabel = { title: "Issued product", category: "forecast" };
  try {
    const body = (await getJson(
      fetcher,
      new URL(`/api/v1/wxproducts/public/products/${id}`, baseURL)
    )) as { kind?: string; values?: Record<string, string> } | null;
    if (!(body?.kind && isProductKind(body.kind))) return fallback;
    const issued = body.values?.issuedAt?.replace("T", " ");
    return {
      title: issued
        ? `${productTitle(body.kind)} · issued ${issued}`
        : productTitle(body.kind),
      category: FORECAST_KINDS.has(body.kind) ? "forecast" : "bulletin",
    };
  } catch {
    return fallback;
  }
}

/** A warning's headline, from its public CAP record. */
async function warningLabel(
  baseURL: string,
  identifier: string,
  fetcher: Fetcher
): Promise<LinkLabel> {
  const fallback: LinkLabel = { title: "CAP warning", category: "cap" };
  try {
    const body = (await getJson(
      fetcher,
      new URL(`/api/cap/alerts/${encodeURIComponent(identifier)}`, baseURL)
    )) as {
      info?: { headline?: string | null; event?: string | null }[];
    } | null;
    const info = body?.info?.[0];
    const title = info?.headline || info?.event;
    return title ? { title, category: "cap" } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A title and category for a link the editor left blank: a product or warning
 * is read from the forecast system, a page from the site's own menu, an
 * outside link from its host name. Always returns something.
 */
export function labelFor(
  link: EditorialLink,
  baseURL: string,
  fetcher: Fetcher = fetch
): Promise<LinkLabel> {
  if (link.type === "product" && link.ref)
    return productLabel(baseURL, link.ref, fetcher);
  if (link.type === "cap" && link.ref)
    return warningLabel(baseURL, link.ref, fetcher);
  if (link.type === "page" && link.ref)
    return Promise.resolve({
      title: linkablePage(link.ref)?.title ?? link.ref,
      category: "article",
    });
  const host = URL.canParse(link.url) ? new URL(link.url).hostname : link.url;
  return Promise.resolve({ title: host, category: "source" });
}
