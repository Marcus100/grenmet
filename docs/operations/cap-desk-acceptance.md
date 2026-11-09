# CAP warning desk: forecaster acceptance (staging)

**Status:** Draft test script for the parallel run; nothing here has been run yet  
**Owner:** GMS (sign-off); maintained by Barrels Grenada engineering  
**Last updated:** 2026-11-05  
**Applies to:** staging only

The new warning desk lives at `https://cap.staging.barrels.gd/desk`. The
current desk stays at `https://gms.staging.barrels.gd/cap` and keeps working
throughout the parallel run. Do each step in **both** desks and compare. Use
status **Exercise** for every test alert, so the public site labels it a drill
and no email, push or webhook is sent (only Actual, Public alerts fan out).

Sign-off means: every row below gives the same result in both desks, or the
difference is written down and accepted.

## Before you start

1. The staging secret `CAP_SSO_CLIENT_SECRET` is set (GitHub `staging`
   environment, at least 32 characters, different from every other app's
   secret) and staging has been redeployed. Without it the desk shows "Desk
   sign-in is switched off".
2. Cloudflare: if the Cloudflare proxy is on for `cap.*`, a cache bypass rule
   must cover `/desk*` and `/auth*` (see "Caching" below). Check it before
   signing in.
3. Your account has a CAP role (at least `cap.alert.read`; to publish,
   `cap.alert.publish`; for emergency publish, the duty-supervisor role).
4. Open GAA Admin → CAP. Click **Try the new desk**. You are asked to sign in
   through auth.barrels.gd once, then land on the warning board.

## Steps

| # | Action | Old desk (gms.../cap) | New desk (cap.../desk) | Check |
|---|---|---|---|---|
| 1 | Sign in, sign out | GAA Admin sign-in | Try the new desk → board; **Log out** top right | Log out of the new desk does not sign you out of GAA Admin. A colleague without a CAP role sees "No access to CAP warnings". |
| 2 | Board | Alerts tab | Board | Same drafts, waiting, approved and in-force alerts. Empty sections still show. |
| 3 | Create a draft | Editor → New | **New warning** | Status Exercise, Heavy Rainfall Watch, Yellow, St. Andrew + St. David, an expiry tomorrow. Saving with a field missing says what is missing. The saved alert opens. Severity reads Moderate (from the colour). |
| 4 | Edit the draft | not available | Alert page → **Edit draft** | Change the headline, add St. Patrick, change the colour to Orange. Save. The alert page shows the new headline, three parishes and Severe. Nothing else changed (sender, contact, sectors, source bulletin). |
| 5 | Validate | Validate alert | **Validate** | Same errors and warnings. Buttons stay off until validation passes and you tick "I have reviewed…". |
| 6 | Request review | Request review | **Request review** | State becomes SUBMITTED in both. |
| 7 | Colleague review (optional) | Mark reviewed / Request changes | same | A colleague (not the author) can record either; the author does not see these buttons. The state does not change. |
| 8 | Approve | Record approval | **Approve** | State becomes APPROVED. You may approve your own alert. |
| 9 | Edit after approval | — | **Edit draft** on an approved alert | The editor warns it goes back to Draft. After saving, the state is DRAFT and needs approval again. |
| 10 | Publish | Publish CAP alert | **Publish** → **Publish now** | A confirmation is asked first. The alert appears on `cap.staging.barrels.gd` labelled as an exercise. |
| 11 | Schema refusal | — | Publish an alert that fails the CAP 1.2 schema (ask Barrels for a test case) | "Not published: the CAP XML does not follow the official CAP 1.2 schema", with each problem on its own line. Nothing is published. |
| 12 | Issue update | not available | Published alert → **Issue update** | A new draft opens with the same content, type Update, and "replaces <identifier> when published". Change the colour to Red and extend the expiry. Approve and publish. The original moves to the past list on the public site with "replaced by". Clicking Issue update twice opens the same draft, not a second one. |
| 13 | Raise to warning | GMS alerts → Raise to warning | — | Raise from a saved GMS alert in GAA Admin (wxproducts). The new draft appears under Drafts on the new board too and can be edited and published there. Its source-bulletin link is kept after editing. |
| 14 | Imported alert | Import | (import still in GAA Admin) | Import a partner alert in GAA Admin. On the new board it shows **Imported**. On its page, Publish and Emergency publish stay off until you tick "I have checked this imported alert against its source". A non-conforming import shows its schema problems. Issue update is not offered for it. |
| 15 | Emergency publish | Emergency publish | Note: write a reason → **Emergency publish** → confirm | Needs a reason. Publishes a DRAFT without approval. The audit history shows `emergency_publish` with the reason. |
| 16 | Emergency with a format problem | — | Emergency publish the schema test case from step 11 | The warning goes out. The page says "Published with a CAP format problem" with the problem, and after reloading the red banner "This alert went out with a CAP format problem" stays. The duty supervisor gets the notification. |
| 17 | Cancel | Cancel alert | Cancellation reason → **Cancel alert** → confirm | Needs a reason. A public CAP Cancel message is issued; the alert leaves the active list. |
| 18 | Mark expired | Mark expired | **Mark expired** → confirm | The alert leaves the active list; no public message. |
| 19 | Errors | — | Let the session expire (or log out in another tab), then press any action | "Your desk session has ended. Sign in again" with a link. A refused action names the reason. |
| 20 | Plain http feed (still checked in GAA Admin) | GAA Admin, Feeds | — | Open a feed saved on plain `http` before the https rule. It shows `insecure_since` and a grace end date (`grace_ends_at`), 14 days after `insecure_since`, and is still fetched until then. Saving an https address clears the date. Once the date has passed it shows `grace_expired` and is skipped, without being deleted, with the message "plain http no longer allowed". Agree a test feed with Barrels; do not move a real partner's date. |
| 21 | Impact matrix picks the colour (still checked in GAA Admin) | GAA Admin, GMS alerts and hazard profiles | — | For one hazard, pick a likelihood and impact on the matrix: the suggested colour (green, yellow, orange or red) matches the grid. A hazard with an approved profile (key `ibf-<hazard>`) uses its own grid; otherwise the standard WMO grid applies. On Raise to warning, choosing a colour that differs from the suggestion asks for a reason of at least 10 characters. |
| 22 | Draft a new hazard profile version | GAA Admin, hazard profiles → **Save new draft version** | `/desk/profiles` → **Edit draft** (on a draft) or **Draft new version** (on an approved version) → change one wording → **Save as new draft version** | The saved version has the next number and state **draft**, and the page says it needs approval. The version it started from is unchanged, and an approved version never changes in place. A draft's older version stays in the history. A colleague without hazard library access sees the reason in plain words and no save button. |
| 23 | Approve a profile version | GAA Admin → **Approve saved version** | `/desk/profiles` → **Approve version N** → confirm | Approval is refused for the author's own version ("A different reviewer must approve it"). Approval is never one click: the dialog names the profile and version. After approval the version is marked approved with the approver and time. No warning is issued. |
| 24 | Start a warning from an approved profile | GAA Admin → **Create alert draft** | `/desk/profiles` → "Start a warning from this version" → subtype, product, colour → **Create warning draft** | Opens a new warning draft on its page with the version's wording. Nothing is submitted, approved, published or sent. A draft version (not yet approved) shows "Approve this version before starting a warning from it." |

## Caching (check once)

From a terminal:

```bash
curl -sI https://cap.staging.barrels.gd/desk | grep -i cache-control   # private, no-store
curl -sI https://cap.staging.barrels.gd/about | grep -i cache-control  # public, ... s-maxage=60 ...
```

The desk and `/auth/*` must never show `s-maxage` or a Cloudflare `cf-cache-status: HIT`.
With the Cloudflare proxy on for `cap.*`, `cf-cache-status` must be `DYNAMIC`
or `BYPASS` for `/desk`, `/desk/signin` and `/auth/start`. The cache rules from
`scripts/production/cloudflare-cache-rules.py` (docs/operations/cloudflare-proxy.md)
cache static assets only and bypass any request that carries a `*_session`
cookie (the desk's is `cap_desk_session`), so the desk is already outside the
cache. The "never cache" rule also names `/desk` and `/auth/` explicitly as a second
line of defence. That rule changes only when the owner re-runs
`cloudflare-cache-rules.py --apply` for the environment; until then rely on the
check above.

## What the new desk does not do yet

Settings, areas, feeds, integrations, imports and the audit page stay in GAA
Admin for now. Hazard profiles can be edited on the desk (rows 22 to 24); the
impact matrix a profile uses is edited there too. Editing a profile on either
desk makes a draft version, so the two desks can never change an approved
version. New warnings are always created as an Alert:
an Update comes from **Issue update** and a Cancel from **Cancel alert**.

## Rollback

Nothing is switched over: the old desk keeps working. To take the new desk
offline, empty `CAP_SSO_CLIENT_SECRET` and redeploy; sign-in then shows
"Desk sign-in is switched off" and no session can be created.
