# Social posting to Facebook and Instagram: owner checklist

**Status:** Built and switched off. Posts are dry runs until the steps below are done.  
**Owner:** Barrels Grenada engineering (decisions: repository owner)  
**Last updated:** 2026-10-30

GMS posts approved in the CMS can go to the GMS Facebook Page and Instagram
account automatically. WhatsApp is not automated: an editor copies the stored caption
by hand. Until the owner finishes the steps below, nothing reaches Facebook or
Instagram. Each post is recorded as a dry run and the staff list says why.

Two things must both be true before a post goes live:

1. the feature flag `social-live-posting` is on for that environment, and
2. the Meta settings (page id, Instagram account id and the page access token) are set.

Switching either one off stops live posting. A post that has already gone out stays
published.

---

## 1. Create the Meta set-up (owner)

Meta's screens change often. Follow the current Meta help pages where they differ
from this list.

1. **Business account.** Use the GMS or Barrels business account in Meta Business
   Suite (business.facebook.com). Give yourself full control.
2. **Facebook Page.** The Page that receives the posts (the GMS page). You must be an
   admin of it.
3. **Instagram business account.** Switch the GMS Instagram account to a professional
   (business or creator) account, then link it to the Facebook Page in the Page's
   linked accounts settings. Posting needs that link.
4. **Meta app.** Create a Business app at developers.facebook.com and add it to the
   business account. Add the products Meta asks for to post to a Page and to
   Instagram (the Facebook Login and Instagram content publishing products).
5. **Permissions.** The app needs these permissions:
   - `pages_manage_posts` (post to the Page)
   - `pages_read_engagement` (read the Page the post goes to)
   - `instagram_basic` (read the linked Instagram account)
   - `instagram_content_publish` (publish to Instagram)
   Development mode works only for people who hold a role on the app. Posting to a
   Page that other people administer needs Meta's App Review to approve these
   permissions for live use. Plan that review before the launch date.
6. **Page access token.** Create a long-lived Page access token for the GMS Page
   with the permissions above, from the app's token tools (Graph API Explorer or the
   Page's access token settings). It must come from a user who is an admin of the Page.
   Keep a note of which user made it. The token can stop working if that user loses
   the Page role or changes their password.
7. **Page id and Instagram account id.** Read the Page id from the Page's settings or
   the Graph API. Read the Instagram account id from the linked account, as Meta shows
   it (the Graph API can list it for the Page).

Do not paste the token into chat, email, a ticket or a file in the repository.

## 2. Put each value where the software reads it

| Value | Where | Notes |
| --- | --- | --- |
| Page id | GitHub environment **variable** `META_PAGE_ID` (staging, then production) | Numbers only. |
| Instagram account id | GitHub environment **variable** `META_INSTAGRAM_ACCOUNT_ID` | Numbers only. |
| Page access token | GitHub environment **secret** `META_PAGE_ACCESS_TOKEN` | Never a variable, never in a file. |
| Approved hosts | GitHub environment **variables** `SOCIAL_LINK_HOSTS` (the GMS site, for example `gms.example.org`) and `SOCIAL_IMAGE_HOSTS` (the CMS media host) | Plain hostnames, comma-separated. Empty refuses every social post, so set them before the CMS sends posts. |
| Distribution secret | GitHub environment **secret** `CMS_DISTRIBUTION_SECRET` (staging and production) | One value, at least 32 characters. The deployment gives it to both the API and the CMS. Never a variable, never in a file, never in chat. |
| Feature flag | The Barrels admin app, Flags page: create the flag `social-live-posting` | See step 3. |

The deployment passes these to the worker only. The release preflight refuses a page id
or Instagram account id that is not numbers, so a typo fails the deploy and does not
crash the running worker.

Nothing is written to an `.env` file by hand.

## 3. Create the feature flag (owner, in the Barrels admin app)

Create the flag with these settings:

- **Key:** `social-live-posting` (it must match exactly).
- **Description:** Live posting of approved GMS posts to Facebook and Instagram.
- **Enabled:** on, but only once steps 4 and 5 below are ready.
- **Audience, environments:** first `staging` only. Add `production` later, when
  you approve it.
- **Audience, everyone:** on.
- **Success metric:** required when the flag is on outside local development. For
  example: "Approved GMS posts reach the Facebook page and Instagram account within
  15 minutes, with a link back to the site, and nothing else is posted."
- **Review by / expires:** set a review date, so the flag is reviewed (a flag past its
  expiry switches off by itself).

Flags take up to 30 seconds to reach the worker.

## Before you switch live posting on

1. **Approved hosts.** Set `SOCIAL_LINK_HOSTS` to the GMS site's host and
   `SOCIAL_IMAGE_HOSTS` to the host the CMS serves images from (plain hostnames, such
   as `gms.example.org`). Until these are set, the CMS cannot save any social post: the
   API refuses it with a message that names the host.
2. **Set `CMS_DISTRIBUTION_SECRET` in the staging and production environments.** In
   GitHub, open the repository's Settings, then Environments, then `staging` (and later
   `production`). Under Environment secrets, add a secret named exactly
   `CMS_DISTRIBUTION_SECRET`. The value is at least 32 characters; generate it with
   `openssl rand -base64 32` and paste it straight into GitHub. The next deploy passes
   it to the API and the CMS. Until it is set, the API answers 503 to the CMS and no
   social post is saved. Nothing is written to an `.env` file, and the value must not
   go into chat, email or a ticket.
   - Set it once, before go-live, so a value that was ever used in a test cannot post.
     To change it later, set a new value in the same place and deploy.
3. **The CMS also needs `GMS_SITE_URL`, which is an owner decision (open item).** The
   CMS builds post addresses from the weather site's public origin
   (`https://weather.<your domain>`). The deployment does not pass it to the CMS yet, so
   the CMS sends nothing until it does. It is not wired because it also turns on post
   addresses in the newsletter feed, which changes public output. Decide that first,
   then ask engineering to wire it.

## 4. Switch on in staging first

1. Set the three staging values above in the GitHub `staging` environment and deploy.
2. Create the flag as in step 3, with the audience set to `staging` only.
3. In the CMS on staging, approve one test story for social. Use a Facebook and an
   Instagram platform, with an image (Instagram needs one).
4. In the staff list (`GET /api/v1/content-distribution/admin/posts`, with the social
   permission), the rows should show `posted` with an `external_id`. Check the Facebook
   Page and the Instagram account. Look at the wording, link and image.
5. If a row shows `dead` or `skipped`, read its `error` or `reason`, then fix the
   cause (see the table below). Do not post by hand until you know why.
6. Repeat once more with a text-only Facebook story.

If you would rather not put test content on the real GMS Page, use a Meta test Page
and a test Instagram account for staging, and set the staging values to those.

## 5. Production, only with your go-ahead

1. Set the three production values in the GitHub `production` environment.
2. Add `production` to the flag's audience environments.
3. Watch the first day's posts in the staff list.

## What each status means

| Status | Meaning | What to do |
| --- | --- | --- |
| `posted` | Live on the platform. `external_id` is the Meta post id. | Nothing. |
| `dry_run_sent` with reason "switched off" | The flag is off. Not sent. | Switch the flag on if you want posts to go out. |
| `dry_run_sent` with reason "not configured" | The flag is on, but a Meta value or the token is missing. Not sent. | Check the three values in the environment. |
| `dry_run_sent` with reason "does not look like a token" | The token is set but is not one unbroken value (for example it has a space or a line break). It is never shown in the reason. Not sent. | Paste the token again as one line, without spaces. |
| `skipped` | Not sent. Instagram needs an image and this post has none. Saving the post again does not change a skipped row. | Post by hand, or ask engineering to look at the row. |
| `failed` (shown while retrying) | Meta was busy or unreachable. The system tries again, up to five times, with waits. | Nothing, unless it stays failed. |
| `dead` with a Meta message | Meta refused the post. The message says why (for example a wrong page id, a missing permission, or an image Instagram cannot read). Not retried. | Fix the cause. Post by hand if the story is still needed. |
| `dead` with "Outcome unknown" | The request reached Meta and no reply came back. The post may be live. It was not sent again, on purpose. | **Check the Facebook page and the Instagram account first.** If it is not there, post by hand. |

Each post is sent at most once. The system never sends a dead post again, and there is
no button to retry one. To send a story again, post it by hand, or ask engineering to
look at the row after you have checked the page.

## Switch it off

- **Fast:** turn the flag off in the Barrels admin app (takes up to 30 seconds). Scheduled
  posts then become dry runs with the reason "switched off". Posts already published
  stay up.
- **Stronger:** remove `META_PAGE_ACCESS_TOKEN` from the environment and redeploy.

## Known limits

- Instagram posts need an image that Meta can read. Meta's documentation specifies
  JPEG. A PNG may be refused, and the post then shows `dead` with Meta's reason.
- A Facebook photo post cannot carry a clickable link, so the link is written into the
  text under the photo.
- The Graph API version is pinned in the code (`v24.0`). Check Meta's version list
  before going live; Meta retires each version after about two years.
- The first live post has not been tested against Meta. The tests use a stand-in for
  Meta. Expect to fix something on the first staging run.
- A server error (HTTP 5xx) on the publish call is **not retried**. The post shows as
  "Outcome unknown" and was sent once. Meta may have published it before failing, so
  check the page before posting the story by hand, otherwise it may appear twice.
- Meta's rate-limit answers (HTTP 429 and the rate-limit codes) are retried, because
  Meta answers them before creating anything.
- A link or image on a host that is not in `SOCIAL_LINK_HOSTS` or `SOCIAL_IMAGE_HOSTS`
  is refused when the CMS saves the post. The CMS reports the refusal; publishing on the
  website is not blocked.

## Engineering reference

- Code: `apps/api/fastapi/src/content_distribution/` (`meta_graph.py` for the Meta
  calls, `service.py` for the decisions, `config.py` for the settings).
- Domain notes and the state machine: `apps/api/fastapi/src/content_distribution/AGENTS.md`.
- Settings table: [environment reference](../env.md) (the FastAPI and GitHub sections).
