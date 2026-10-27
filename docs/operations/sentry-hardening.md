# Sentry hardening runbook

**Status:** Active runbook (owner-reviewed target settings; apply and verify)  
**Owner:** Barrels Grenada engineering (operator: repository owner)  
**Last updated:** 2026-10-20

Organization-level Sentry settings that keep personal data and secrets out of
error reports, and keep the account itself safe. The owner reviewed the target
values below. The apps already scrub on the way out (only the `area`, `digest`
and `request_id` tags survive; see
[extended rules](../agents/extended-rules.md#telemetry-sentry-and-monitoring));
these settings are the second lock on Sentry's side, so a missed field in code is
still removed before storage.

Items marked **Unverified** or **to verify** were not checked against Sentry's
current screens or documentation.

## Where the settings live

Sentry → **Settings** (gear) → your organization → **Security & Privacy**, unless
a step says otherwise. Projects in scope: `grenmet-staging` and
`grenmet-production`. Organization settings marked "Require" apply to every
project and cannot be weakened per project.

## Before you start

1. Turn on **your own** Sentry 2FA first: **User Settings → Security →
   Two-Factor Authentication**. Save the recovery codes. See the
   [account 2FA checklist](account-2fa-checklist.md#sentry).
2. **Why:** step 1 below removes every member without 2FA from the organization,
   including you if you skipped this.
3. Take a screenshot of the current **Security & Privacy** page. **Undo point:**
   it records the previous values.

## Target settings

| # | Setting | Target | Why |
| --- | --- | --- | --- |
| 1 | Require Two-Factor Authentication | **On** | Stops a stolen password opening error data. **Warning:** members without 2FA are removed and emailed; they can rejoin after enabling it (**unverified** exact behaviour) |
| 2 | Require Data Scrubber | **On** | Forces server-side scrubbing on every project |
| 3 | Require Using Default Scrubbers | **On** | Keeps Sentry's built-in list (passwords, credit cards and similar) |
| 4 | Prevent Storing of IP Addresses | **On** | IP addresses are personal data and not needed for debugging |
| 5 | Global Sensitive Fields | see list below | Any field with these names is replaced with `[Filtered]` |
| 6 | Allow Shared Issues | **Off** | Shared issue links are public URLs anyone can open |
| 7 | Enhanced Privacy | **On** | Hides source code and request details from email alerts and similar notifications |
| 8 | Allow join requests | **Off** | Strangers cannot ask to join. **Unverified:** this lives under **Organization Settings → General → Membership**, not Security & Privacy |

Global Sensitive Fields (one per line in the box):

```text
token
access_token
refresh_token
id_token
code
session
cookie
authorization
password
secret
api_key
email
phone
```

**Trade-off:** `code` and `session` also match harmless fields such as an error
`code` or a `session` count, which will show as `[Filtered]`. The owner accepted
that; if it hides something you need, put the exact field name in **Global Safe
Fields** rather than removing the sensitive entry.

**Verify each:** reload the page and confirm the value stuck. For item 1, open
**Members**: everyone listed should show 2FA enabled.

**Undo:** set the toggle back or delete the line. For item 1, turning it off
does not restore removed members; re-invite them.

## CSP reports: mask URL query strings

**Why:** Content Security Policy violation reports (sent by browsers for `docs`
and `signal` today; see [security](../security.md)) include the page URL and the
blocked URL. Query strings can carry sign-in codes or tokens, for example
`?code=...` on an OAuth callback. The global field names above do not catch a
token embedded inside a URL string, so add an Advanced Data Scrubbing rule.

Path: **Security & Privacy → Advanced Data Scrubbing → Add Rule** (organization
level, so it covers both projects).

| Field | Value |
| --- | --- |
| Method | **Replace** (placeholder `[query]`) |
| Data type | **Regex matches** |
| Regex | `\?.*$` |
| Source | `$csp.document_uri \|\| $csp.blocked_uri \|\| $request.url` |

**To verify in Sentry's
[advanced data scrubbing docs](https://docs.sentry.io/security-legal-pii/scrubbing/advanced-datascrubbing/):**
the selector names for CSP report fields (`$csp.document_uri`,
`$csp.blocked_uri`), the `||` combination syntax, and whether the Source box
offers these names in its suggestions. Use the names Sentry suggests if they
differ.

**Verify with a test report** (creates one clearly labelled event):

1. Find the report endpoint the apps use:

   ```bash
   curl -sI https://docs.barrels.gd | grep -i content-security-policy
   ```

   Copy the `report-uri` value (it is a public ingest URL, not a secret).
2. Send a fake violation whose URL contains a query string:

   ```bash
   curl -sS -X POST '<report-uri from step 1>' \
     -H 'Content-Type: application/csp-report' \
     -d '{"csp-report":{"document-uri":"https://docs.barrels.gd/test?code=TEST-SCRUB-1","blocked-uri":"https://example.com/x.js?token=TEST-SCRUB-1","violated-directive":"script-src","effective-directive":"script-src","original-policy":"script-src self"}}'
   ```

3. In Sentry, open the newest CSP issue in the matching project. Both URLs should
   end at the path, with `[query]` instead of `?code=...` and `?token=...`. Search
   the event JSON for `TEST-SCRUB-1`: it must not appear.
4. Resolve and delete the test issue.

**Undo:** delete the rule from the same page.

## Checklist

| Item | Done | Verified |
| --- | --- | --- |
| Own 2FA on, recovery codes saved | ☐ | ☐ |
| Require Two-Factor Authentication | ☐ | ☐ |
| Require Data Scrubber | ☐ | ☐ |
| Require Using Default Scrubbers | ☐ | ☐ |
| Prevent Storing of IP Addresses | ☐ | ☐ |
| Global Sensitive Fields list | ☐ | ☐ |
| Allow Shared Issues off | ☐ | ☐ |
| Enhanced Privacy on | ☐ | ☐ |
| Join requests off | ☐ | ☐ |
| CSP query-string rule, test report masked | ☐ | ☐ |

Re-check quarterly with the [access review](../infrastructure.md#access-review).
