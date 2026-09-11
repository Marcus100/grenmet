const anchorHref = /<a\b[^>]*\bhref=["']([^"']+)["']/g;
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
  const expected = new URL(`https://auth.${domain}/`);
  expected.searchParams.set("app", "gms-cms");
  expected.searchParams.set("returnTo", `https://cms.${domain}/admin`);
  const links = [...body.matchAll(anchorHref)];
  const hasDestination = links.some((match) => {
    try {
      const url = new URL(match[1].replaceAll("&amp;", "&"));
      return (
        url.origin === expected.origin &&
        url.pathname === "/" &&
        url.searchParams.get("app") === "gms-cms" &&
        url.searchParams.get("returnTo") ===
          expected.searchParams.get("returnTo")
      );
    } catch {
      return false;
    }
  });
  if (!(validPage(response, body, "<a") && hasDestination))
    throw new Error(`CMS sign-in destination failed for cms.${domain}`);
}

export async function checkDeployment(domain, fetcher = fetch) {
  if (!(domain && validDomain.test(domain)))
    throw new Error("A valid base domain is required");
  // Public CMS data is a supported API. Empty published content is valid.
  await check(`https://cms.${domain}/api/content?limit=1`, '"docs":', fetcher);
  for (const [host, path, marker] of [
    ["api", "/api/v1/utils/ready/", '"ready"'],
    ["hapi", "/health", '"status":"ok"'],
    ["api", "/api/cap/latest-active", '"data":'],
    ["admin", "/api/public/products", '"products":'],
    ["admin", "/api/ready", '"ready"'],
    ["cms", "/api/ready", '"ready"'],
    ["auth", "/", "<form"],
  ])
    await check(`https://${host}.${domain}${path}`, marker, fetcher);
  for (const host of ["docs", "weather", "signal", "mbia", "events"])
    await check(`https://${host}.${domain}/`, "<main", fetcher);
  await checkCmsSignIn(domain, fetcher);
}

if (import.meta.main) {
  await checkDeployment(process.argv[2]);
  console.log("External functional smoke passed");
}
