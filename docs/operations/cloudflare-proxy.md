# Cloudflare proxy runbook (public sites behind Cloudflare, free plan plus Advanced Certificate Manager)

**Status:** Ready for the owner; nothing applied. Every switch is off until the owner turns it on.  
**Owner:** Barrels Grenada engineering (operator: repository owner)  
**Last updated:** 2026-10-31  
**Issue:** #859 (the pairing documented in #544)

Today every `*.barrels.gd` and `*.staging.barrels.gd` hostname resolves straight to
its DigitalOcean droplet ("DNS only", grey cloud). This runbook puts the droplet
hostnames behind Cloudflare's proxy (orange cloud), so Cloudflare absorbs floods
and hides the droplet's address, without breaking per-visitor rate limits.

## The five things that change together

Missing one of the first four either puts every visitor in one shared rate-limit
bucket or lets a visitor choose their own address. Do them in the order below.

| # | Change | Where | Switch |
| --- | --- | --- | --- |
| 1 | Hostnames proxied (orange cloud) | Cloudflare dashboard, DNS | Owner, per record |
| 2 | Traefik trusts `X-Forwarded-For` only from Cloudflare's published ranges | `infra/docker/docker-compose.deploy.yml`, ranges in `infra/cloudflare/ip-ranges.txt` | `CLOUDFLARE_PROXY_ENABLED` |
| 3 | Visitor address counted 2 hops from the right (Cloudflare, then Traefik) on the API and the web hosts that forward it (events, bookings, weather) | `render-env.py` sets `VISITOR_IP_PROXY_HOPS` | `CLOUDFLARE_PROXY_ENABLED` |
| 4 | Only Cloudflare's ranges may reach 80/443 on the droplet | DigitalOcean Cloud Firewall, `scripts/production/cloudflare-origin-firewall.py` | Owner runs the script |
| 5 | Cache static assets only; never the API, staff hosts, signed-in requests | Cloudflare cache rules, `scripts/production/cloudflare-cache-rules.py` | Owner runs the script |

### What `CLOUDFLARE_PROXY_ENABLED` changes

It is a GitHub **environment variable** (Settings → Environments → `staging` or
`production` → Variables), read by `.github/workflows/deploy.yml` and turned into
settings by `scripts/production/render-env.py`. Unset or `false` is today's
behaviour. Anything other than `true`/`false` stops the deploy.

| Setting | Off (unset or `false`) | On (`true`) |
| --- | --- | --- |
| Traefik forwarded headers (`websecure`) | `insecure=false`: trusted from nobody (Traefik's own default) | `trustedIPs=` the vendored Cloudflare ranges |
| Traefik per-client cap of 100 requests in flight | Keyed on the connecting address (`depth=0`) | Keyed on the address Cloudflare appended (`depth=1`) |
| `VISITOR_IP_PROXY_HOPS` (API, web-events, web-gms, web-bookings) | `1` | `2` |
| Let's Encrypt challenge | TLS challenge on 443 (today) | HTTP challenge on 80 (Cloudflare ends TLS in front of the droplet, so the TLS challenge cannot reach Traefik) |

The switch acts on the whole droplet: every hostname on that droplet must be
proxied at the same time (step 5 of the order below), or the grey ones pool
their visitors into one rate-limit bucket. Turning the switch on while the
hostnames are still grey is safe, but rate limits pool until the clouds are
orange, so do the two steps back to back.

**Babydoll** (`babydoll.barrels.gd`, on Vercel) and **Elections** (Vercel) are not
on the droplets: leave their records exactly as they are, and leave Babydoll's
`VISITOR_IP_PROXY_HOPS` on the Vercel project unchanged. The weather droplet
(SURFACE, wis2box) is out of scope.

## Before you start: owner decisions

1. **Decided 2026-10-31: pay for Advanced Certificate Manager (about US$10 a
   month) so staging is proxied and tested first.** Cloudflare's free
   certificate (Universal SSL) covers `barrels.gd` and one level below it
   (`events.barrels.gd`), **not** `events.staging.barrels.gd`. Proxying a staging
   hostname without another certificate makes browsers refuse it
   ([Cloudflare: Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)).
   Advanced Certificate Manager is a paid add-on on the `barrels.gd` zone; the
   zone itself stays on the free plan. Step 1 of the order of work orders the
   certificate. Keep the subscription while any staging record is proxied; if
   it is ever cancelled, grey every staging record first.
   *Fallback only, if the add-on cannot be bought:* skip the staging orange
   cloud. On staging run steps 2-4 and the firewall script in plan mode only
   (never `--apply` while staging is grey: it would take staging offline), then
   do production in a quiet hour with the rollback ready. Uploading your own
   certificate is not available on the free plan.
2. **The storm cache plan conflicts with "never cache the API".**
   `docs/operations/cloudflare-storm-cache.md` plans to cache `/alerts`,
   `/api/alerts/*`, `/api/satellite/*` on the weather site and
   `/api/v1/wxwatch/public/*`, `/api/cap/*` on the API. The cache rules here
   follow #859 (no `/api/` path and nothing on `api.*` is cached) and run after
   any other rule, so they win. Decide whether those public feeds become a
   reviewed exception later; until then they are not cached.
3. **Bot Fight Mode stays off.** On the free plan it applies to the whole zone
   and would challenge machine clients: the weather collectors posting to
   `api.*`, Stripe and Resend webhooks, the deploy smoke test and uptime probes.

## Cloudflare zone settings (once, before any orange cloud)

They affect only proxied records, so changing them while everything is grey
changes nothing for visitors.

1. **SSL/TLS → Overview:** encryption mode **Full (strict)** (already set on
   2026-10-05 according to `docs/operations/domain-configuration.md`; confirm).
   Never Flexible: Traefik redirects HTTP to HTTPS, so Flexible loops forever.
2. **SSL/TLS → Edge Certificates → Always Use HTTPS: Off.** It is on today.
   With it on, Cloudflare also redirects Let's Encrypt's
   `/.well-known/acme-challenge/` check to HTTPS, where Traefik does not answer
   it, and certificates stop renewing. Traefik already redirects every other
   HTTP request to HTTPS at the droplet (permanent redirect), so visitors still
   end on HTTPS. Minimum TLS version 1.2 stays. Leave Cloudflare's HSTS setting
   off: Traefik sends HSTS.
3. **Security → Bots:** Bot Fight Mode **Off** (decision 3 above).
4. **Speed / Caching:** no "Cache Everything" page rules; leave Rocket Loader and
   Auto Minify off (they rewrite pages and break the content security policy).

## Tokens and names you need (never commit them)

- **Cloudflare API token** for the cache-rule script: My Profile → API Tokens →
  Create Token → Custom: permission **Zone → Cache Rules → Edit**, zone resources
  **Include → Specific zone → barrels.gd**. Cloudflare's docs also list Account
  Rulesets Edit and Account Filter Lists Edit; add them only if the script is
  refused. Export it in your shell as `CLOUDFLARE_API_TOKEN` and the zone ID
  (barrels.gd → Overview, right column) as `CLOUDFLARE_ZONE_ID`. Delete the token
  when finished.
- **doctl** logged in (`doctl auth init`) with a DigitalOcean token that can
  write firewalls, and the firewall names from Networking → Firewalls (for
  example `core-staging`, `core-production`; see `docs/operations/host-hardening.md`
  Step 4). If the droplet has no Cloud Firewall yet, create it from that step
  first.
- The droplet's public address, for the origin tests only (DigitalOcean
  dashboard). Keep it in your shell, not in the repository.

## Order of work (staging first)

Set these in your shell for the checks:

```bash
DOMAIN=staging.barrels.gd            # production: DOMAIN=barrels.gd
ORIGIN_IP=<staging droplet public IPv4>   # never commit it
AUTH=(-u "<one staging basic-auth user:password>")   # production: AUTH=()
```

1. **Advanced certificate, Active before any orange cloud.** Cloudflare →
   barrels.gd → SSL/TLS → Edge Certificates → **Order Advanced Certificate**
   (the first order asks you to subscribe to Advanced Certificate Manager,
   about US$10 a month). Hostnames, exactly these three: `barrels.gd`,
   `*.barrels.gd`, `*.staging.barrels.gd` (the zone apex must be on the
   certificate; a wildcard covers one level only, so `*.barrels.gd` does not
   cover `events.staging.barrels.gd`). Certificate authority: Let's Encrypt or
   Google Trust Services; validation method: TXT (Cloudflare adds the records
   itself because it hosts the zone's DNS); validity: the default, which
   renews automatically. Save, then wait on the Edge Certificates page until
   the certificate's status is **Active** (it passes Initializing, Pending
   Validation, Pending Issuance and Pending Deployment; usually minutes for a
   zone whose DNS is on Cloudflare). **Do not orange-cloud anything until it
   is Active.** Leave Universal SSL on; it keeps serving anything the advanced
   certificate does not cover.
2. **Range list current.** `python3 scripts/production/cloudflare_ranges.py --check`
   prints "matches". On drift run `--update`, commit through a PR and wait for it
   to reach the environment.
3. **Cache rules (harmless while grey).**
   ```bash
   python3 scripts/production/cloudflare-cache-rules.py --environment staging --print   # read the rules
   python3 scripts/production/cloudflare-cache-rules.py --environment staging           # plan
   python3 scripts/production/cloudflare-cache-rules.py --environment staging --apply
   ```
   Run it again: it must say "No change".
4. **Switch on.** GitHub → Settings → Environments → `staging` → Variables → add
   `CLOUDFLARE_PROXY_ENABLED` = `true`. Redeploy staging (Actions → Deploy →
   Run workflow, environment `staging`, image tag of the current staging
   deploy, or merge the next change to `staging`). On the droplet confirm:
   ```bash
   P=grenmet-staging   # production: P=grenmet
   docker inspect "$P-proxy-1" --format '{{join .Args "\n"}}' | grep -E 'forwardedHeaders|challenge'
   # --entrypoints.websecure.forwardedHeaders.trustedIPs=103.21.244.0/22,...
   # --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
   for c in api web-events web-gms web-bookings; do
     docker inspect "$P-$c-1" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep VISITOR_IP_PROXY_HOPS
   done   # each: VISITOR_IP_PROXY_HOPS=2
   ```
5. **Orange cloud, straight after step 4** (Cloudflare → barrels.gd → DNS →
   Records; edit each record, toggle **Proxy status** to Proxied, Save). Only
   records that point at the staging droplet, in this order: the public sites
   first, staff hosts last, so a problem shows on a low-risk host first:
   1. `*.staging` (the wildcard: covers every staging hostname without its own
      record);
   2. any explicit A/AAAA records for staging hostnames on the droplet, in this
      order: `weather`, `cap`, `gmsdash`, `events`, `bookings`, `signal`,
      `mbia`, `docs`, then `auth`, `admin`, `gms`, `cms`, `api`, `adminer`.
   After each one: `curl -sI "${AUTH[@]}" https://<host>.$DOMAIN/ | grep -iE '^(server|cf-ray)'`
   shows `server: cloudflare`, and the browser-facing certificate is the
   advanced one:
   `openssl s_client -connect <host>.$DOMAIN:443 -servername <host>.$DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -ext subjectAltName`
   lists `*.staging.barrels.gd`. A certificate error in the browser means the
   advanced certificate is not Active yet: grey the record and wait. A 525/526
   error means the origin certificate is wrong; grey that record and check
   Traefik's logs.
6. **Verify** every acceptance item below.
7. **Origin firewall** (only once *every* droplet hostname is orange: a grey one
   stops working the moment this applies).
   ```bash
   python3 scripts/production/cloudflare-origin-firewall.py --firewall core-staging           # plan: read it
   python3 scripts/production/cloudflare-origin-firewall.py --firewall core-staging --apply
   ```
   It changes only the inbound TCP 80 and 443 rules (adds the Cloudflare rules,
   then removes the "everyone" rules, so the ports never close), keeps SSH, the
   private 5432 rule, ICMP and all outbound rules, and re-reads the firewall to
   confirm. Then run the direct-origin test below.
8. **Certificate renewal check** within a day: `docker logs "$P-proxy-1" 2>&1 | grep -i acme`
   shows no errors. To force one, the owner can watch the next renewal (Traefik
   renews 30 days before expiry); certificates stay valid meanwhile.
9. **Soak** for at least two days of normal staging use, then repeat steps 2-8
   for production (the advanced certificate from step 1 already covers
   `barrels.gd` and `*.barrels.gd`) (`--environment production`, firewall `core-production`,
   GitHub environment `production`, records `*` and the explicit production
   hostnames on the production droplet). Production's switch reaches the droplet
   with the next production release, or a manual Deploy run of the current
   release tag.

## Verify each acceptance item (#859)

### 1. Rate limits key on each visitor, from two networks

Direct to the API (`POST /api/v1/auth/token` allows 10 a minute per address).
From network A (for example home Wi-Fi):

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://api.$DOMAIN/api/v1/auth/token" \
    --data 'username=ratelimit-probe@example.invalid&password=wrong'
done
# 400 or 401 ten times, then 429
```

Within the same minute, from network B (a phone hotspot, a second machine):
the same `curl` once answers 400/401, **not** 429. If network B gets 429, every
visitor shares one bucket: check `VISITOR_IP_PROXY_HOPS` on the API container
and that the record is orange.

Through a web host that forwards the visitor (weather alert sign-up, 5 a minute;
staging only sends mail to `barrels.gd` addresses):

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w '%{http_code}\n' "${AUTH[@]}" -X POST "https://weather.$DOMAIN/api/alerts/subscribe" \
    -H 'Content-Type: application/json' --data '{"email":"<you>@barrels.gd"}'
done
# 200s, then 429; network B at the same time still gets 200
```

### 2. A forged `X-Forwarded-For` changes nothing

While network A is limited (429), repeat one request from network A with forged
headers:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://api.$DOMAIN/api/v1/auth/token" \
  -H 'X-Forwarded-For: 198.51.100.77' -H 'X-Real-IP: 198.51.100.77' \
  -H 'X-Visitor-IP: 198.51.100.77' --data 'username=ratelimit-probe@example.invalid&password=wrong'
# still 429
```

Cloudflare appends the real address after the forged one and the API reads the
entry Cloudflare wrote, so the forged value is ignored. `X-Visitor-IP` without
the shared web-host secret is ignored as before.

### 3. The droplet refuses direct HTTPS from outside Cloudflare

After step 7, from your laptop:

```bash
curl -sk --connect-timeout 8 -o /dev/null -w '%{http_code}\n' \
  --resolve "events.$DOMAIN:443:$ORIGIN_IP" "https://events.$DOMAIN/"   # 000 (timed out)
nc -vz -w 5 "$ORIGIN_IP" 443    # times out
nc -vz -w 5 "$ORIGIN_IP" 80     # times out
nc -vz -w 5 "$ORIGIN_IP" 22     # still succeeds from your SSH address
curl -sI "${AUTH[@]}" "https://events.$DOMAIN/" | head -1   # still answers through Cloudflare
```

### 4. Signed-in pages and API responses are never cached

```bash
for url in "https://api.$DOMAIN/api/v1/utils/health-check/" "https://auth.$DOMAIN/" \
           "https://admin.$DOMAIN/" "https://gms.$DOMAIN/" "https://cms.$DOMAIN/admin" \
           "https://events.$DOMAIN/" "https://weather.$DOMAIN/"; do
  printf '%s  ' "$url"
  curl -s -o /dev/null -D - "${AUTH[@]}" "$url" | grep -i '^cf-cache-status' || echo '(none)'
done
# every line: BYPASS or DYNAMIC, never HIT
```

Static assets (production; on staging the basic-auth header makes Cloudflare
bypass everything, so staging shows BYPASS here too):

```bash
asset=$(curl -s "https://events.$DOMAIN/" | grep -oE '/_next/static/[^"]+\.js' | head -n 1)
curl -sI "https://events.$DOMAIN$asset" | grep -i cf-cache-status   # MISS, then on a second run HIT
curl -sI -H 'Cookie: events_session=probe' "https://events.$DOMAIN$asset" | grep -i cf-cache-status   # BYPASS
```

Signed in, in a browser: developer tools → Network → the page document → response
header `cf-cache-status` is `DYNAMIC` or `BYPASS`.

### 5. No user-facing request runs past Cloudflare's timeout

See the inventory below. During the soak, Cloudflare → Analytics → look for any
**524** responses; there should be none.

## Rollback

Fastest first. Each step is independent; stop when the problem is gone.

1. **Firewall first** (otherwise greying a record makes it unreachable):
   ```bash
   python3 scripts/production/cloudflare-origin-firewall.py --firewall core-staging --restore-open --apply
   ```
   Or in the dashboard: Networking → Firewalls → the firewall → Rules → set 80 and
   443 sources back to All IPv4 and All IPv6.
2. **Grey cloud:** DNS → each record → Proxy status → DNS only. Visitors move
   within about 5 minutes (the proxied records' time to live).
3. **Switch off:** set `CLOUDFLARE_PROXY_ENABLED` to `false` (or delete it) on the
   GitHub environment and redeploy. Do this soon after step 2: with the switch on
   and the records grey, rate limits pool into one bucket (never spoofable).
4. **Cache rules** (optional; they do nothing while grey):
   `python3 scripts/production/cloudflare-cache-rules.py --environment staging --remove --apply`.
5. Turn **Always Use HTTPS** back on only after every record is grey again and
   the switch is off (the TLS challenge is back).
6. Keep the advanced certificate and its subscription unless the proxy is
   abandoned for good; cancel only after every staging record is grey.

## Requests longer than Cloudflare's timeout (inventory)

Cloudflare's free plan returns **524** when the origin sends nothing for a while:
#859 budgets 100 seconds; Cloudflare's current documentation lists a 125-second
proxy read timeout and a 30-second limit for writing the request to the origin
([connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)).
The free plan also caps request bodies at 100 MB.

The origin already cuts every request shorter than either: Traefik's `websecure`
entrypoint allows 60 seconds to read a request and 120 seconds to write the whole
response (`docker-compose.deploy.yml`), and server-side calls from the web hosts
give up after at most 30 seconds (`AbortSignal.timeout`). The longest outbound
call inside an API request waits 15 seconds (Google sign-in, CAP area lookups).
There are no WebSockets and no server-sent event streams in the codebase.

| Kind | Where | Expected time | How it is handled |
| --- | --- | --- | --- |
| PDF downloads and previews (WeasyPrint, in the request) | `wxproducts` product PDFs and previews, HR attendance week, daily status, absentee, leave, shift swap, parking, signed documents, billing invoices, CAP alert PDF | seconds | Synchronous; well under 100 s. If a large report ever nears 60 s, move it to the worker (ARQ) and email or poll the result. |
| CSV exports | `GET /events/manage/{id}/settlement.csv`, `GET /payments/admin/reconciliation.csv` | under a few seconds | Filtered and paged in SQL; staff only, never cached (staff host or `/api/` path rules). |
| Imports and bulk writes | HR roster `import-csv`, `import-grid`, `assignments/bulk`; baseline staff balances import; CAP alert import | seconds | Small files, synchronous. |
| Uploads | HR documents (25 MiB limit; Traefik body limit 30 MiB), CMS media | depends on the visitor's link | Cloudflare receives the whole body first, then sends it to the droplet quickly, which helps against Traefik's 60-second read limit. Event images go straight to object storage (presigned upload), not through Cloudflare. |
| File and image streams | `GET /storage/assets/{id}`, wxwatch archive assets | first byte quickly | Streamed; the timeout counts time without data, not the total. |
| Publishing and sending | CAP publish, eRegister publish (WIS2, email), notifications | under a second in the request | Side effects are queued to the worker, not done in the request. |
| Next.js pages | every web host | seconds | Streamed; server-side API calls time out at 5-30 seconds. |
| Machine clients | weather collectors (`POST /wxwatch/ingest`), Stripe and Resend webhooks, uptime probes, deploy smoke test | seconds | Not user-facing. Keep Bot Fight Mode off so they are not challenged. |

None is user-facing and long-running. Long work belongs in the worker.

## Known limits and follow-ups

- **Anyone on Cloudflare can reach the droplet from Cloudflare's addresses.** The
  firewall and `trustedIPs` admit every Cloudflare address, including
  Cloudflare Workers run by other customers that connect to the droplet's
  address directly. Such a request could set its own `X-Forwarded-For` and pick a
  rate-limit bucket. Closing this needs **Authenticated Origin Pulls** with a
  certificate for this zone only (free on all plans: Traefik then requires
  Cloudflare's client certificate), a separate reviewed change. Treat the
  droplets' addresses as already known: they were public in DNS until now.
- **Traefik's access logs show Cloudflare's address.** Their `ClientAddr` is the
  connecting peer, which becomes a Cloudflare edge; use `cf-ray` and the API's
  own records to trace a visitor. Sign-in sessions record the visitor, not the
  edge: `src/auth` takes the address from `src/rate_limit.py` `request_ip()`
  (the same hop rule as the rate limits, unmasked), and a test fails if
  `request.client.host` is read there again.
- **The range list changes occasionally.** Run `cloudflare_ranges.py --check`
  every quarter (and before each production release that touches the edge). A
  new Cloudflare range missing from the list means visitors through that range
  are refused by the firewall and pooled by Traefik until the list is updated
  and the firewall script re-run.
- **Staging basic auth** makes every staging request carry an `Authorization`
  header, so Cloudflare never caches anything on staging; cache hits can only be
  shown on production.
