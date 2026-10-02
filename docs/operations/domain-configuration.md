# Domain configuration handoff

Checked and updated 2 October 2026. Cloudflare hosts DNS for `barrels.gd` and
`eugine.me`. This document records live settings, not a request to redeploy the
DigitalOcean applications.

## Completed

- Both zones: Full (strict) SSL, minimum TLS 1.2, Always Use HTTPS enabled.
  All web records remain DNS-only, so these proxy settings do not currently
  affect requests to Vercel or DigitalOcean. HSTS preload was not enabled.
- DNSSEC signing enabled on both zones, pending registrar DS publication.
- Removed obsolete apex NS records `ns1.onlydomains.com`, `ns2.onlydomains.com`,
  and `ns3.onlydomains.com` from the Cloudflare `barrels.gd` zone after public
  delegation confirmed `asa.ns.cloudflare.com` and `kipp.ns.cloudflare.com`.
- Vercel's existing `eugine.me` redirect to `www.eugine.me` now uses HTTP 308.
- Barrels homepage and Elections have valid public HTTPS. The homepage's `www`
  alias redirects permanently to `barrels.gd`.

## Owner: finish DNSSEC at each registrar

Add a **DS record at the domain registrar**, not a TXT/DS record in the
Cloudflare DNS record editor. Keep the existing Cloudflare nameservers.

Both domains use key tag **2371**, algorithm **13 (ECDSAP256SHA256)**, and digest
type **2 (SHA-256)**. The digests differ:

| Domain | DS digest |
| --- | --- |
| `barrels.gd` | `D4C253E114A2162AC9ADBAF3EB1471B98A7FB5B0EB3C08CCA257F735285BDD39` |
| `eugine.me` | `6DCC823F5E9A5F7C141B3788F9E4F46E053A0B22350634D751A855695AFAE1A3` |

These are public DNS values, not secrets. Re-read Cloudflare's DNSSEC panel if
signing is subsequently disabled/re-enabled, because keys may change. Verify
both zones become Active after the registrar publishes their DS records.

## Owner: account and email decisions

- Cloudflare's user API reports 2FA disabled. Enable it and save recovery codes.
  Check Vercel's personal-account 2FA as well; its state was not confirmed.
- `barrels.gd` has only the Microsoft verification-style root MX destination
  `ms15862131.msv1.invalid`. Choose the intended receiving mailbox provider before
  changing MX. Existing Resend/SES sending records were preserved.
- `barrels.gd` DMARC is monitoring-only; `eugine.me` has no DMARC record. Inventory
  legitimate senders and establish reporting before adopting an enforcement policy.
- Review the Vercel Hobby plan against intended company/client use; no plan or
  billing changes were made.
- The interactive Cloudflare CLI OAuth grant is broad. Revoke it when maintenance
  is complete, or use a narrowly scoped token for recurring DNS automation.

## Deployment work still needed

- `barrels-grenada` and `elections-grenada` are manual Vercel deployments. Commit
  and push their reviewed files, then promote through the repository's normal
  branch flow before connecting production Git builds to `main`. Their app
  directories were absent from `origin/main` at review time. Root directories
  are `apps/web/barrels` and `apps/web/elections`, respectively. Keep shared
  source access enabled. Existing `eugineme` and `nisnisa` Git links are unchanged.
- Configure Elections-specific Sentry credentials as described in the
  [deployment guide](../web/elections-deployment.md). No credentials were copied
  between applications or environments.
- Review existing personal-site and NISA preview environment scopes against
  intended backend/email services before separating credentials.
- Production `docs`, `weather`, `signal`, `mbia`, `events`, and `cms.barrels.gd`
  failed TLS verification. Certificate inspection of docs/weather/cms confirmed
  **TRAEFIK DEFAULT CERT**, not a Cloudflare certificate. Staging counterparts
  passed HTTPS checks. Inspect the production containers, hostname routers and
  ACME logs using the [release runbook](release-runbook.md) and
  [deployment troubleshooting](../deployment.md). Repository Compose already
  declares these hosts and the Let's Encrypt resolver. No SSH access was
  available to inspect the running production stack; no release was published.

## Rollback context

Previous Cloudflare settings were SSL `full`, minimum TLS `1.0`, and Always Use
HTTPS `off`. Removed NS records all had Auto TTL and the apex name `barrels.gd`.
The personal-site redirect previously returned 307. DNSSEC must not be disabled
after DS publication without coordinating removal of the registrar DS record.

References: [Cloudflare DNSSEC](https://developers.cloudflare.com/dns/dnssec/),
[Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/),
[DNS-only behavior](https://developers.cloudflare.com/dns/proxy-status/).
