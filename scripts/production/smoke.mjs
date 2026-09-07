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
    throw new Error(`Functional smoke failed: ${new URL(url).hostname}`);
}

if (import.meta.main) {
  const domain = process.argv[2];
  if (!(domain && /^[a-z0-9.-]+$/.test(domain)))
    throw new Error("A valid base domain is required");
  // Public CMS data is a supported API. Empty published content is valid.
  await check(`https://cms.${domain}/api/content?limit=1`, '"docs":');
  for (const [host, path, marker] of [
    ["api", "/api/v1/utils/ready/", '"ready"'],
    ["admin", "/api/ready", '"ready"'],
    ["cms", "/api/ready", '"ready"'],
    ["auth", "/signin", "<form"],
  ])
    await check(`https://${host}.${domain}${path}`, marker);
  for (const host of ["docs", "weather", "signal", "mbia", "events"])
    await check(`https://${host}.${domain}/`, "<main");
  console.log("External functional smoke passed");
}
