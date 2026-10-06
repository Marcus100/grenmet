# Integration readiness and owner setup

**Owner:** Barrels Grenada engineering

**Last reviewed:** 2026-10-05

**Scope:** Core staging and production deployment, with separate public-site analytics.

## Repeat the configuration audit

Use an authenticated GitHub CLI account with permission to list environment secret
metadata. The command reads secret **names**, never secret values. It follows all
pages, evaluates the same environment-specific storage aliases as deployment, and
prints missing configuration alongside the source analytics catalogue.

```bash
pnpm integrations:readiness --environment staging
pnpm integrations:readiness --environment production
```

Add `--strict` to fail for missing core inputs, partial integrations, invalid
activation flags or missing credentials for explicitly activated monitoring.
Fully absent optional integrations remain visible without blocking the core release.
A successful check does not certify provider access or live delivery. The report
does not inspect running containers, Vercel, backup environments or inherited
repository/organisation settings. Those require separate checks; do not copy
credentials between environments to make the report green.

## Current inventory

This is a dated configuration snapshot, not a statement that a release is live.
GitHub metadata was inspected for both environments. The previous successful core
deployments were October 3; the release integration changes await promotion.

| Integration | Staging | Production | Acceptance still needed |
| --- | --- | --- | --- |
| Core database/API/CMS secrets and infrastructure variables | Present | Present | Deployed migrations, authenticated workflows |
| Events database credentials and release wiring | Prepared | Prepared | Deploy; listings, organiser edits, saves and RSVPs |
| Google OAuth | Credentials present | Missing | Correct callbacks and real sign-in |
| Application Spaces storage | Credentials present | Missing | Upload, retrieve, private access denial |
| Resend sending | Key present | Key present | Sender DNS and actual delivery |
| Protected React Email rendering | Separate secret created | Separate secret created | Deploy; authenticated template rendering |
| Resend webhook signing | Missing | Missing | Provider endpoint and signed callback |
| Sentry | Matching environment DSN present | Matching environment DSN present | Controlled error and exact-release source maps |
| WxWatch collector authentication | Missing | Missing | Configure sender and receiver together |
| CAP signing | Missing | Missing | Required only for the approved signed-alert workflow |
| Stripe | Missing | Missing | Required only for an approved paid feature |
| Host monitoring automation | Activation flag absent | Activation flag absent | Existing monitoring acceptance gates |
| Worker heartbeat | Credential present | Missing | Live successful-job heartbeat; independent of counters flag |
| Operational request/job counters | Activation flag absent | Activation flag absent | Optional operational telemetry, not visitor analytics |
| GA4 | Disabled by source policy | Seven public-site mappings | Deploy and test consent/collection |

The production backup environment has its own Spaces credentials and a successful
October 5 backup run. This does not configure application uploads. Existing backup
jobs include restore integrity checks; full recovery acceptance still requires the
complete current database inventory and representative application checks.

## Owner actions, in order

### 1. Configure production Google sign-in

In the Google Cloud project you own, configure the production web OAuth client.
The staff callback wired by the core Compose deployment is
`https://auth.barrels.gd/google/callback`; staging uses
`https://auth.staging.barrels.gd/google/callback`. Check the app-scoped Events
configuration separately before offering Google login there; its current release
uses email-code sign-in.

Save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` under the GitHub **production**
environment. Keep credentials out of chat and committed files. After deployment,
verify a real login, session exchange and logout; check the consent-screen audience
and publishing status in Google Cloud.

### 2. Configure production application storage

Provide a production application bucket and appropriately scoped credentials.
Configure these **production** environment secrets:

- `STORAGE_ENDPOINT_URL`
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`

The existing `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`,
`DO_SPACES_ACCESS_KEY_ID` and `DO_SPACES_SECRET_ACCESS_KEY` aliases are also
supported within that same environment. Existing backup credentials belong to
the backup workflow; they should not be repurposed without checking bucket access
and isolation. Set `STORAGE_PUBLIC_BASE_URL` only if public-file delivery needs it.

Test an allowed upload and download plus an unauthorised private-file request.
CMS media also uses its existing persistent volume; verify its backup coverage
separately rather than assuming application object storage covers it.

### 3. Complete email delivery visibility

In Resend, verify the sending domain and create separate webhook endpoints:

- Staging: `https://api.staging.barrels.gd/api/v1/webhooks/resend`
- Production: `https://api.barrels.gd/api/v1/webhooks/resend`

Select delivery, delayed-delivery, bounce and complaint events. Store each
endpoint's signing secret as `RESEND_WEBHOOK_SECRET` in its matching GitHub
environment. Deploy before testing delivery. No signing secret should be invented
locally: it must match the provider endpoint.

The receiver verifies signatures and logs delivery events. Automatic suppression
and complaint-driven unsubscribe actions are not implemented; receipt of a webhook
does not prove those business workflows exist. Open/click tracking is unnecessary
for this delivery-reliability setup.

`EMAIL_RENDER_SECRET` has already been generated independently for both
environments without exposing its value. Deployment passes each matching secret
to the API, worker and web-auth renderer. This configures rendering, not email
sending or webhook verification. Actual email acceptance requires an authorised
test recipient; staging notification-domain restrictions remain in force.

### 4. Complete monitoring and collector activation

Follow [analytics and monitoring activation gates](analytics-monitoring.md#cicd-ownership-and-activation).
Do not enable all switches simply because secret names exist. Verify free-account
limits, host permissions, storage capacity, provider delivery and recovery evidence.

- `MONITORING_DEPLOY_ENABLED=true` installs declared host monitoring on deployment.
- `WORKER_HEARTBEAT_URL` configures worker completion heartbeats; verify receipt.
- `TELEMETRY_ENABLED=true` separately enables bounded operational counters.
- Coordinate `WXWATCH_INGEST_TOKEN` with the actual collector process before
  activation. A receiver-only random token leaves the sender unable to ingest.
- CAP signing needs the appropriate certificate/private key and operational
  approval; it cannot be completed by generating an arbitrary certificate.

### 5. Promote and verify

Use the [release runbook](release-runbook.md). Merge/deployment requires explicit
owner authorisation. First verify staging login, Events, email, uploads and error
reporting, plus absence of browser analytics. Then follow the documented production
promotion process and verify the seven public GA4 destinations after consent.
Barrels and Elections have independent Vercel deployment/configuration surfaces;
the core Docker workflow does not certify them.

Payments, bot challenges, messaging providers and additional data APIs remain
feature-specific follow-ups. Provider selection, account eligibility, costs and
any new dependencies must be resolved before implementation. No new paid service,
provider account, payment collection or deployment was activated by this work.
