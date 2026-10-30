const anchorHref = /<a\b[^>]*\bhref=["']([^"']+)["']/gu;
const validState = /^[A-Za-z0-9_-]{32}$/u;
const validDomain = /^[a-z0-9.-]+$/u;
const renderError =
  /NEXT_HTTP_ERROR_FALLBACK|Application error:|An error occurred in the Server Components render|"digest"\s*:|\\"digest\\"\s*:/u;

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

// The first request to a new host triggers certificate issuance, so the first
// deploy of gms.* may need a few seconds. Retries only apply where asked for.
async function checkWithRetry(url, expected, fetcher, attempts) {
  const delay = Number(process.env.SMOKE_RETRY_DELAY_MS ?? 15_000);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await check(url, expected, fetcher);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
    // The GMS/GAA portal (hostname gms.*; the public weather site is weather.*).
    ["gms", "/api/public/products", '"products":'],
    ["gms", "/api/ready", '"ready"'],
    ["cms", "/api/ready", '"ready"'],
    ["auth", "/", "<form"],
  ])
    await checkWithRetry(
      `https://${host}.${domain}${path}`,
      marker,
      fetcher,
      host === "gms" ? 4 : 1
    );
  for (const host of ["docs", "weather", "signal", "mbia", "events"])
    await check(`https://${host}.${domain}/`, "<main", fetcher);
  await checkCmsSignIn(domain, fetcher);
}

// Staging web hosts sit behind Traefik basic auth. With `user:password` set, it is
// sent to web hosts of this domain only: never to the API (which has no gate) or
// any other origin.
export function withEdgeCredentials(fetcher, domain, credentials) {
  if (!credentials) return fetcher;
  const authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
  return (url, init = {}) => {
    const { hostname } = new URL(url);
    if (!hostname.endsWith(`.${domain}`) || hostname === `api.${domain}`)
      return fetcher(url, init);
    const headers = new Headers(init.headers);
    headers.set("authorization", authorization);
    return fetcher(url, { ...init, headers });
  };
}

if (import.meta.main) {
  const domain = process.argv[2];
  await checkDeployment(
    domain,
    withEdgeCredentials(fetch, domain, process.env.STAGING_PROBE_CREDENTIALS)
  );
  console.log("External functional smoke passed");
}
