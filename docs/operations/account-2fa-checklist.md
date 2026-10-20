# Account 2FA and API token checklist

**Status:** Active runbook (owner actions; nothing here has been applied yet)  
**Owner:** Barrels Grenada engineering (operator: repository owner)  
**Last updated:** 2026-10-20

Every provider account that can change the platform, in the order to secure
them. For each: where to turn on two-factor authentication (2FA), whether you can
enforce it for everyone, and how to make a least-privilege API token. Dashboard
paths move often; anything marked **Unverified** was not checked against the
provider's current screens.

This page covers **provider accounts**. Sign-in protection for users of our own
apps is in [privileged MFA](privileged-mfa.md).

## Rules that apply to every account

1. **Prefer passkeys or a hardware security key, then an authenticator app.**
   Avoid SMS: phone numbers can be hijacked by SIM swap. After adding a stronger
   method, remove SMS as a fallback where the provider allows it.
2. **Save recovery codes immediately**, in two places: your password manager and
   a printed copy kept somewhere safe offline. **Why:** if you lose your phone,
   the codes are the only way back in.
3. **Register two factors** where allowed (for example a passkey on your laptop
   and an authenticator on your phone), so one lost device is not a lockout.
4. **Verify:** sign out, sign back in and confirm the provider asks for the second
   factor. Then check the account's security page shows 2FA **on**.
5. **Undo:** each provider's security page lets you remove or replace a factor.
   You need a working factor or a recovery code to do it, which is why step 2
   matters.

## Order of work

Secure the accounts that can reset others first.

| # | Account | Why it comes here |
| --- | --- | --- |
| 1 | Your personal email (the Gmail that receives alerts and resets) | Password resets for everything else land here |
| 2 | Password manager | Holds every other password and recovery code |
| 3 | Domain registrar(s) | Control of the domains themselves |
| 4 | Cloudflare | DNS for `barrels.gd` and `eugine.me`; 2FA was **off** on 5 October 2026 |
| 5 | GitHub | Code, workflows, deployment secrets |
| 6 | DigitalOcean | Servers, firewalls, backups |
| 7 | Vercel | Homepage and Elections deployments |
| 8 | Sentry | Error data, which can contain user details |
| 9 | Resend | Can send email as `barrels.gd` |
| 10 | Better Stack | Uptime monitoring and alerts |
| 11 | Google (GA4) | Analytics properties |
| 12 | PostHog | Product analytics |

## Per provider

### Google account (Gmail, GA4)

- **2FA:** [myaccount.google.com](https://myaccount.google.com) → **Security →
  2-Step Verification**; then **Passkeys and security keys**. Save backup codes
  from the same page.
- **Optional:** Google's Advanced Protection Program for the strongest setting.
- **GA4 least privilege:** GA4 → **Admin → Account access management**. Give
  anyone else **Viewer** or **Analyst**, never **Administrator**.

### Password manager

Turn on 2FA in its own settings and print its emergency kit or recovery key.

### Domain registrar(s)

**Unverified** which registrar holds each of `barrels.gd`, `eugine.me` and
`weather.gd`. In each: **Account → Security → Two-factor authentication**, plus a
recovery email on a different domain from the ones it manages. If GAA or GMS
holds `weather.gd`, send them this item. See
[domain security](domain-security.md#1-registrar-lock-and-2fa).

### Cloudflare

- **2FA:** **My Profile → Authentication → Two-Factor Authentication**. Add a
  security key and an authenticator app; save the backup codes.
- **Enforce for members:** **Manage Account → Members** has a 2FA requirement
  setting (**unverified** exact name). Turn it on if anyone else ever joins.
- **Revoke the broad CLI login** recorded in
  [domain configuration](domain-configuration.md#owner-account-and-email-decisions):
  **My Profile → API Tokens**, delete tokens you do not recognise or no longer use.
- **Read-only audit token:** **My Profile → API Tokens → Create Token → Create
  Custom Token**. Permissions: `Zone → Zone → Read`, `Zone → DNS → Read`,
  `Zone → Zone Settings → Read`. Zone resources: **Include → Specific zone** for
  each domain. Set an expiry (90 days). Name it `audit-readonly`.

### GitHub

- **2FA:** **Settings → Password and authentication**. Add a passkey and an
  authenticator app; download recovery codes.
- **Enforce:** if `Marcus100` is an organization, **Organization settings →
  Authentication security → Require two-factor authentication**. **Unverified:**
  whether it is an organization or a personal account; personal accounts have no
  enforcement setting, only your own 2FA.
- **Review:** **Settings → Applications** and **Settings → Developer settings →
  Personal access tokens**; delete anything unused.
- **Token:** Claude Code cloud sessions already reach GitHub through their own
  connection, so do not add a GitHub token to the environment. If you need one
  elsewhere, use a **fine-grained** token limited to this repository with
  read-only permissions and an expiry.

### DigitalOcean

- **2FA:** **Settings → Security → Two-factor authentication** (from your
  avatar menu; **unverified** exact path). Save the recovery codes.
- **Enforce for a team:** **Settings → Team** has a "require 2FA" option
  (**unverified**).
- **Read-only audit token:** **API → Tokens → Generate New Token**, choose
  **Custom scopes** or **Read Only**, expiry 90 days. **Why read-only:** an audit
  can list droplets, firewalls and alerts but cannot change or delete them.

### Vercel

- **2FA:** **Account Settings → Authentication → Two-Factor Authentication**
  (authenticator or passkey). Its state was **not confirmed** in October 2026.
- **Enforce for a team:** **Team Settings → Security**; may need a paid plan
  (**unverified**).
- **Token:** **unverified** whether Vercel offers read-only tokens. If tokens
  carry full access, do not store one in the Claude Code environment; use the
  Vercel connector or the dashboard instead.

### Sentry

- **2FA:** **User Settings → Security → Two-Factor Authentication**. Save
  recovery codes.
- **Enforce:** **Organization Settings → Security & Privacy → Require Two-Factor
  Authentication** (part of [Sentry hardening](sentry-hardening.md)).
- **Read-only audit token:** **User Settings → Personal Tokens → Create New
  Token** (**unverified** label; older UI: **Auth Tokens**) with only
  `org:read`, `project:read`, `event:read`. A read-only token cannot upload
  source maps or change settings, which is what you want for audits.

### Resend

- **2FA:** account **Settings → Security** (**unverified** path).
- **API keys:** production sending keys stay in GitHub environment secrets only.
  Use **Sending access** keys limited to one domain. Do not put a Resend key in
  the Claude Code environment.

### Better Stack

- **2FA:** **Account settings → Security** (**unverified** path).
- **Enforce:** team-level 2FA requirement if offered (**unverified**).

### PostHog

- **2FA:** **Settings → Personal settings → Two-factor authentication**.
- **Enforce:** **Settings → Organization** has an "enforce 2FA" option
  (**unverified**).

## Putting audit tokens into the Claude Code cloud environment

**Why:** a read-only token lets an agent check DNS, firewalls and Sentry
settings against these runbooks without you copying values by hand.

**Never paste a token into the chat.** Chat text is stored and shown back.

1. Create the read-only token as described above. Copy it straight from the
   provider page.
2. In the Claude Code app, open the cloud environment menu in the session's
   title bar → **Edit**.
3. Under **Network secrets** (older app versions say **API credentials**), add:

   | Variable name | Value |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | Cloudflare `audit-readonly` token |
   | `DIGITALOCEAN_TOKEN` | DigitalOcean read-only token |
   | `SENTRY_AUTH_TOKEN` | Sentry read-only personal token |

4. Start a **new** session; existing sessions do not pick up the change.
5. **Verify:** ask the agent to run a read-only call, for example list Cloudflare
   zones. It should succeed, and a write (for example creating a DNS record)
   should fail with a permission error.
6. **Undo:** delete the variable in the environment settings **and** revoke the
   token at the provider. Revoking at the provider is what actually stops it
   working.

Rotate these tokens when they expire, after anyone else has had access to the
environment, or if one is ever shown in output.

## Checklist

| Account | 2FA on | Passkey or key | Recovery codes saved | Enforced for team | Old tokens reviewed | Audit token |
| --- | --- | --- | --- | --- | --- | --- |
| Google | ☐ | ☐ | ☐ | n/a | n/a | n/a |
| Password manager | ☐ | ☐ | ☐ | n/a | n/a | n/a |
| Registrar(s) | ☐ | ☐ | ☐ | n/a | n/a | n/a |
| Cloudflare | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| GitHub | ☐ | ☐ | ☐ | ☐ (org only) | ☐ | n/a |
| DigitalOcean | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Vercel | ☐ | ☐ | ☐ | ☐ | ☐ | n/a |
| Sentry | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Resend | ☐ | ☐ | ☐ | ☐ | ☐ | n/a |
| Better Stack | ☐ | ☐ | ☐ | ☐ | ☐ | n/a |
| PostHog | ☐ | ☐ | ☐ | ☐ | ☐ | n/a |

Repeat this review quarterly with the
[access review](../infrastructure.md#access-review).
