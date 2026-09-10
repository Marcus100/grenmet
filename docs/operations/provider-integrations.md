# Provider integrations: development, staging and production

Status: repository configuration prepared; account-side setup and live acceptance
remain pending. No VM, DNS, account subscription or deployment was changed.
Staging and production use separate DigitalOcean VMs, confirmed by operator SSH
output on 2026-09-10:

| Environment | Host | SSH account | Root disk usage shown at login |
| --- | --- | --- | --- |
| Staging | `167.71.24.42` / `grenmet-staging-01` | `root` | 62.1% of 47.39 GB |
| Production | `134.122.119.220` / `grenmet-prod` | `deploy` | 96.2% of 47.39 GB |

Production disk pressure needs diagnosis before deployment. Start with `df -h /`,
`docker system df` and a container inventory. Do not prune database volumes or
backup files blindly. These figures are supplied login output, not agent-run
measurements. Both hosts report a pending restart; plan maintenance after
confirming services, backups and recovery access.

Current repository domains are `*.staging.barrels.gd` and `*.barrels.gd`;
confirm the GMS public aliases before changing DNS. GAA/GMS and Barrels products
must retain separate ownership, reporting and access boundaries.

## Recommended order

1. Reuse the existing DigitalOcean VMs, Traefik and Resend. Inventory actual
   domains, certificates, running image tags and backup destinations over SSH.
2. Finish Sentry and PostHog environment configuration and verify synthetic events.
3. Enable Google Analytics for the public GMS website after configuring its stream.
4. Verify Cloudflare-to-Traefik TLS, DNS, cache bypasses and trusted proxy headers.
5. Add external uptime and scheduled-job alerts to the existing health/backup
   checks; perform an isolated restore. Choose one external uptime service after
   checking existing accounts. Do not host the only outage monitor on the VM it monitors.

| Service | Development | Staging | Production |
| --- | --- | --- | --- |
| Sentry | Optional development project; FastAPI deliberately disables local delivery | Existing staging project/DSN | Existing production project/DSN |
| PostHog | Disabled by leaving key empty, or dedicated development project | Dedicated staging project | Dedicated production project; separate GMS and Barrels reporting |
| Google Analytics | Empty measurement ID by default | Separate test property/stream, debug events | GMS public-site property/stream only |
| Cloudflare | No public dev DNS required | Staging DNS to staging VM | Production DNS to production VM |
| DigitalOcean | Local development services | Existing staging VM and scoped credentials | Existing production VM and scoped credentials |
| Traefik | Existing local routing where needed | Existing VM reverse proxy | Existing VM reverse proxy |
| Resend | Test addresses only | Separate sending key/domain and test recipients | Existing verified sending domain and restricted sending key |

## Evidence from this workspace

- Sentry hooks exist in auth, gaa-admin, gms, docs, signal and mbia, plus FastAPI
  and the CAP worker. Events, CMS and Hono have no Sentry SDK integration yet;
  they must not be described as covered. Their existing health/log checks are
  separate from error reporting. Adding those SDKs is a remaining coverage step.
- The shared PostHog provider is mounted by auth, gaa-admin, gms and docs.
  Browser capture now retains anonymous page-section counts, with DOM capture,
  recording, exceptions, surveys and automatic pageleave disabled. Arbitrary
  properties, URLs, referrers and person-property updates are excluded.
- Server authentication analytics use fresh random event identifiers, never
  emails or session tokens. Provider failures cannot prevent cookie removal.
- Existing Sentry integrations exclude request/user/context/breadcrumb data and
  redact exception messages, retaining error types and stacks. Python excludes
  locals and request bodies. This trades diagnostic detail for content minimisation;
  source maps and local reproduction remain important. Custom SDK integrations,
  attachments and new event channels need their own review before enabling.
- GitHub staging and production contain Sentry upload tokens and environment DSNs.
  Neither environment listed PostHog, GA, Cloudflare or DigitalOcean management
  credentials during this audit. Staging has Spaces credentials; production did
  not list them. This is metadata evidence, not proof of the VMs' runtime settings.
- Resend sending secrets exist in both GitHub environments. Local PostHog keys
  exist in four apps. No local Sentry DSN was configured in the inspected files.
- API rate limiting, container readiness/health checks, worker heartbeat and
  backup/restore scripts already exist. External paging and successful isolated
  recovery still need operational evidence.

## GitHub and application settings

Use GitHub **environment** settings for `staging` and `production`; do not share
production analytics identifiers with staging. The image workflow already selects
these environments, and both verification and publishing builds receive the same
settings. Public browser settings are compiled into Next.js images: changing a VM
variable alone does not update the browser. Rebuild through normal release gates.

| Setting | Location | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | Environment secret | Public ingestion key for that environment's PostHog project |
| `NEXT_PUBLIC_POSTHOG_HOST` | Environment variable or secret | Matching region: `https://us.i.posthog.com` or `https://eu.i.posthog.com` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Environment variable | `G-...`; wired only into the GMS image |
| `SENTRY_DSN_STAGING` / `SENTRY_DSN_PRODUCTION` | Matching environment secret | Existing error ingestion DSN |
| `SENTRY_AUTH_TOKEN` | Environment secret, build secret mount | Existing source-map upload token; never a browser variable |
| `RESEND_API_KEY` | Environment secret | Existing runtime sending key |
| `RESEND_WEBHOOK_SECRET` | Environment secret | Signature verification for existing webhook processing |
| `STORAGE_*` / existing `DO_SPACES_*` | Environment secrets | Existing object storage integration; separate from DO management token |

Do not paste secrets into chat, command arguments, repository files or build args.
Use provider dashboards/GitHub secret forms or `gh secret set NAME --env staging`
with its interactive secret prompt. Change the environment for production.
No agent edits to `.env.*` files are required. For development, an operator may
configure the existing ignored local files, keeping production keys out of them.

GA setup: disable **Enhanced Measurement** on the dedicated stream before enabling
this manual pageview component; otherwise history changes and automatic events
can duplicate counts or transmit unsanitised URL data. Disable Google Signals and
advertising features. The component groups dynamic paths and clears referrers;
it does not install a consent manager. Review the site's privacy/consent policy
before enabling collection; if opt-in is required, gate loading on that preference.
An empty or invalid ID loads no Google script. Do not mount GA in auth or staff apps.

## Read-only provider API checks

`node scripts/integrations/check.mjs --environment staging` inventories required
credential names. Add `--live` to perform authenticated **GET** checks only.
Supply `INTEGRATION_ENVIRONMENT=staging` and provider credentials through the
process environment or an operator-managed credential file outside the repository:

```bash
node scripts/integrations/check.mjs --environment staging --env-file /secure/staging-integrations --live
```

An explicit file does not inherit ambient credentials. Its
`INTEGRATION_ENVIRONMENT` must match the selected environment. The command reports
missing settings, configured-but-unverified settings, HTTP failures or verified
read access; it never prints tokens, URLs or response bodies. It does not send
email, alter DNS, provision infrastructure or establish event delivery.

| Checker settings | Access to grant |
| --- | --- |
| `SENTRY_READ_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Project read access, distinct from upload token |
| `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `NEXT_PUBLIC_POSTHOG_HOST` | Read access to the relevant project; public ingestion key cannot read dashboards |
| `GOOGLE_ANALYTICS_ACCESS_TOKEN`, `GOOGLE_ANALYTICS_PROPERTY_ID` | Short-lived OAuth token with Analytics read scope and property access; numeric property ID differs from measurement ID |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | Zone read for inspection; a separate narrowly scoped DNS edit token only when changing DNS |
| `DIGITALOCEAN_ACCESS_TOKEN` | Account read for this check; grant other scopes only for a concrete operation |
| `RESEND_READ_TOKEN` | Optional management key for domain inspection; Resend has full/sending access, not a read-only key type. Never broaden the runtime sending key just for this check |

The checker supports hosted Sentry and US/EU PostHog. A self-hosted installation
requires explicit endpoint support before using its credentials. Cloudflare and
DigitalOcean management tokens belong in operator/CI tooling, never web apps.
Do not expose Traefik's dashboard publicly for monitoring.

## Cloudflare, Traefik and DigitalOcean acceptance

- Record the VM/SSH aliases and map staging and production domains to the correct
  VM before modifying DNS. DNS/edge changes must be reviewed against this inventory.
- Retain Traefik routing and certificate management. Use Cloudflare Full (strict)
  HTTPS with a valid origin certificate; do not change the challenge method until
  the current certificate renewal configuration is inspected.
- Bypass caching for auth, admin, CMS, authenticated requests and live APIs/CAP feeds.
  Cache immutable public assets separately; verify warning freshness after updates.
- Trust forwarded headers only from verified proxy networks. Preserve the actual
  proxy chain; never enable indiscriminate trust to fix client IP reporting.
- Keep DB/Redis/internal dashboards private. Check firewall, disk/RAM alerts,
  off-VM backups, retention, restore timing and owner/backup-owner access.
- Distinguish Spaces object credentials from VM/API management tokens. Do not
  infer production backups from staging's configured bucket.

## Delivery acceptance still required

For each environment, record timestamp, commit/image, project/property ID and a
synthetic event ID. Verify the event in the provider dashboard/API, not merely an
HTTP success. Test browser and server Sentry separately, source-map resolution,
PostHog page counts and auth outcomes, GA initial/navigation pageviews, and disabled
analytics with missing keys. Confirm staging events never appear in production.
Use synthetic exceptions/content only. Review network payloads for tokens, emails,
form values and unpublished CAP text. Resend email tests require a chosen test
recipient; no email was sent by this task.

Modernisation priorities after this pass: external uptime/paging, backup and job
failure notifications, source-map release verification, analytics consent controls
where required, and closing the three documented Sentry coverage gaps. Existing
CI/image vulnerability gates and rate limits should be validated, not replaced
with additional providers merely to increase the tool count.

## Provider references

- [PostHog browser configuration](https://posthog.com/docs/libraries/js/config)
- [Google Analytics pageviews and Enhanced Measurement](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Cloudflare scoped API permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [DigitalOcean API token scopes](https://docs.digitalocean.com/reference/api/scopes/)
- [Traefik trusted forwarded headers](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/)
- [Resend key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
