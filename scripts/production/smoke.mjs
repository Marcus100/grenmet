import { readFileSync } from "node:fs";

const PORTAL_HOST_LINE = /^GMSADMIN_HOST=(\S+)$/m;
const anchorHref = /<a\b[^>]*\bhref=["']([^"']+)["']/g;
const validState = /^[A-Za-z0-9_-]{32}$/;
const validDomain = /^[a-z0-9.-]+$/;
const renderError =
  /NEXT_HTTP_ERROR_FALLBACK|Application error:|An error occurred in the Server Components render|"digest"\s*:|\\"digest\\"\s*:/;

export function validPage(response, body, expected) {
  return response.ok && body.includes(expected) && !renderError.test(body);
}

export async function check(url, expected, fetcher = fetch) {
  const response = await fetcher(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!validPage(response, body, expected))
    throw new Error(
      `Functional smoke failed: ${new URL(url).hostname}${new URL(url).pathname} (HTTP ${response.status}; expected ${expected})`
    );
}

export async function checkCmsSignIn(domain, fetcher = fetch) {
  const response = await fetcher(`https://cms.${domain}/signin`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  const expected = new URL(
    `https://cms.${domain}/auth/start?returnTo=%2Fadmin`
  );
  const links = [...body.matchAll(anchorHref)];
  const hasDestination = links.some((match) => {
    try {
      const url = new URL(match[1].replaceAll("&amp;", "&"), expected.origin);
      return (
        url.origin === expected.origin &&
        url.pathname === expected.pathname &&
        url.searchParams.get("returnTo") ===
          expected.searchParams.get("returnTo")
      );
    } catch {
      return false;
    }
  });
  if (!(validPage(response, body, "<a") && hasDestination))
    throw new Error(`CMS sign-in destination failed for cms.${domain}`);

  // ADR-0017: the CMS start route creates state before handing off to auth.
  // Inspect the redirect before following it so build defaults or a wrong
  // environment cannot pass merely because their sign-in page renders.
  const handoff = await fetcher(expected.href, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const location = handoff.headers.get("location");
  const target = location && URL.canParse(location) ? new URL(location) : null;
  if (
    !([302, 303, 307, 308].includes(handoff.status) && target) ||
    target.origin !== `https://auth.${domain}` ||
    target.pathname !== "/continue" ||
    target.searchParams.get("app") !== "cms" ||
    !validState.test(target.searchParams.get("state") ?? "")
  )
    throw new Error(`CMS sign-in destination failed for cms.${domain}`);
  await check(target.href, "<form", fetcher);
}

// Full hostname of the GMS/GAA staff portal: GMSADMIN_HOST from the committed
// environment file of the deployment being checked, else gms.<domain>.
function portalHost(domain) {
  for (const file of ["staging.env", "production.env"]) {
    try {
      const text = readFileSync(
        new URL(`../../infra/docker/${file}`, import.meta.url),
        "utf8"
      );
      if (new RegExp(`^BASE_DOMAIN=${domain}$`, "m").test(text))
        return text.match(PORTAL_HOST_LINE)?.[1] ?? `gms.${domain}`;
    } catch {
      // Not available (for example in a packaged run): use the default.
    }
  }
  return `gms.${domain}`;
}

export async function checkDeployment(domain, fetcher = fetch) {
  if (!(domain && validDomain.test(domain)))
    throw new Error("A valid base domain is required");
  // The public homepage feed GMS reads. Empty published content is valid.
  await check(
    `https://cms.${domain}/api/public/home`,
    '"deskUpdates":',
    fetcher
  );
  for (const [host, path, marker] of [
    ["api", "/api/v1/utils/ready/", '"ready"'],
    ["api", "/api/cap/latest-active", '"data":'],
    // The GMS/GAA portal host comes from the environment file (GMSADMIN_HOST).
    [portalHost(domain), "/api/public/products", '"products":'],
    [portalHost(domain), "/api/ready", '"ready"'],
    ["cms", "/api/ready", '"ready"'],
    ["auth", "/", "<form"],
  ])
    await check(
      `https://${host.includes(".") ? host : `${host}.${domain}`}${path}`,
      marker,
      fetcher
    );
  for (const host of ["docs", "weather", "signal", "mbia", "events"])
    await check(`https://${host}.${domain}/`, "<main", fetcher);
  await checkCmsSignIn(domain, fetcher);
}

if (import.meta.main) {
  await checkDeployment(process.argv[2]);
  console.log("External functional smoke passed");
}
