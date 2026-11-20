# Events WhatsApp draft pilot

**Status:** Pilot procedure

**Owner:** Barrels Grenada product and engineering

**Last updated:** 2026-11-19

Compare a fixed WhatsApp announcement with an AI-assisted opening line. The
organiser uses the existing event editor. The saved listing supplies the title,
Grenada date and start time, public venue and canonical Events link. The
organiser controls the final wording and sends it through their own channel.

## Open the preview

On staging or in local development, create a synthetic event under a verified
organiser account. Give it a future start, public visibility and public access.
Save and publish it, open its organiser editor, then append `?pilot=whatsapp` to
the editor URL. For example, use `/dash/events/<id>?pilot=whatsapp`.

The preview is opt-in and checks the editor's existing organiser access. It
uses the saved version of the listing. After rescheduling or changing event
details, refresh the editor and check the updated values before copying a draft.

## Compare the two approaches

1. For the fixed draft, review the initial opening line and the listing facts,
   then select **Copy draft**.
2. For the AI-assisted draft, open **Use an AI prompt** and copy the prompt to
   the approved tool. Start the trial with synthetic events. Ask the tool for
   one opening line and review it for accuracy before putting it in **Opening
   line**. The event details remain fixed in the composed draft.
3. Compare both original versions with the same saved listing. Reject an
   opening line that invents prices, availability, admission terms, performers
   or links. Record corrections before sharing copy with anyone.

| Listing and timestamp | Method | Draft, review and correction minutes | Incorrect or unsupported claims | Prompt version and model or tool | Accepted by organiser |
| --- | --- | --- | --- | --- | --- |
| | Fixed draft | | | | |
| | AI-assisted opening line | | | | |

Measure time through review and correction with the same listing facts for both
methods. Start with synthetic acceptance of the opt-in flow, access restrictions,
local time across midnight UTC, stale date after rescheduling, the fixed fact
block and clipboard fallback. A real organiser trial establishes whether the
AI-assisted option saves time without sacrificing accuracy. Use the fixed draft
whenever it is faster or the suggested opening line needs more correction.
