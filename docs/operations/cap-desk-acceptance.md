# CAP warning desk: forecaster acceptance (staging)

Owner: GMS (sign-off) · Maintained by: Barrels Grenada · Applies to: staging only

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

## Caching (check once)

From a terminal:

```bash
curl -sI https://cap.staging.barrels.gd/desk | grep -i cache-control   # private, no-store
curl -sI https://cap.staging.barrels.gd/about | grep -i cache-control  # public, ... s-maxage=60 ...
```

The desk and `/auth/*` must never show `s-maxage` or a Cloudflare `cf-cache-status: HIT`.
When the Cloudflare proxy is switched on for `cap.*`, add a cache rule "Bypass
cache" for URI paths starting with `/desk` or `/auth`, ahead of any rule that
caches HTML (`docs/operations/cloudflare-proxy.md` once that guide lands).

## What the new desk does not do yet

Settings, areas, feeds, integrations, hazard profiles, imports and the audit
page stay in GAA Admin for now. New warnings are always created as an Alert:
an Update comes from **Issue update** and a Cancel from **Cancel alert**.

## Rollback

Nothing is switched over: the old desk keeps working. To take the new desk
offline, empty `CAP_SSO_CLIENT_SECRET` and redeploy; sign-in then shows
"Desk sign-in is switched off" and no session can be created.
