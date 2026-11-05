# CMS editor guide: From the Desk posts

**Status:** Active  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-04

For Grenada Meteorological Service (GMS) staff who write "From the Desk" posts in the
CMS (the content editor behind the weather site). It describes what the CMS does
today. The collection is called **Desk updates** in the admin menu, under **GMS
Content**. Technical detail for engineers is in `apps/web/cms/AGENTS.md`.

## What a desk post is

A short post from the forecast office about what it issues, or a service notice. Never
type forecast figures or warnings into it. Paste the product under **Related links**
and tick **Main link** so the site shows the live details.

## Fields

| Field | What it does |
| --- | --- |
| Title | Required, up to 120 characters. |
| About (product or service) | Required. The product or service the post covers (forecasts, tropical weather outlook, hazard bulletins, CAP warnings, marine, aviation, climate and data, service notice, community and education, announcement). Shows as the small label above the headline. |
| Post type (`format`) | Standard (words and a picture), Audio, Video or Chart (the picture is a chart). |
| Media link (`mediaUrl`) | Shown only for Audio and Video, and required for them. Paste a YouTube or Facebook share link for video, a SoundCloud link for audio. The link is checked when you save; a link from another site is refused. The reader presses play to start it. |
| Your role (`authorRole`) | Optional, up to 60 characters, for example "Duty forecaster". Shown after your name on the card. |
| Pin to the top of From the Desk (`pinned`) | Puts the post right after the official forecast cards, ahead of newer posts. Several pinned posts show newest first. Only editors who may manage the homepage can change it. |
| Summary | Short text, up to 200 characters. |
| Cover picture | Every desk card shows a picture; the credit comes from the Credit field of the picture in the media library. |
| Related links | Pasted addresses, one marked **Main link**. Blank titles and categories are filled in for you. |
| Include in newsletter | Adds the post to the daily newsletter digest. Only publishers of this section can tick it. |

**Based on:** when the first related link is an issued product, the card shows a
"Based on the ..." line automatically (`basedOn`). You do not type it.

## Social media sharing

Open **Social media sharing** on the post.

- **Approve for social:** only publishers of this section can tick it. Nothing is sent
  to a social platform without it. When the post is published with it ticked, it is
  sent to each platform you chose. Facebook, Instagram and WhatsApp Channel are sent
  automatically; X, YouTube and LinkedIn are copy-and-paste only. If the post has
  already gone out, saving it again does not post it twice.
- **Pictures, one per platform:** Facebook image (1200 x 630 pixels, landscape),
  Instagram image (1080 x 1080 or 1080 x 1350 pixels, square or portrait) and
  WhatsApp Channel image (1200 x 630 pixels, landscape). A platform without its own
  picture uses the **Social image (all platforms)**, and if that is empty, the cover.
- **Text:** each platform has its own text box (X, Facebook, Instagram, LinkedIn,
  WhatsApp Channel). The shared starting caption is only a starting point for you; it
  is not sent.
- **Page sharing picture** (`socialImageUrl`): when someone shares the post's page
  address, the picture shown is the social image, then the cover. This is separate
  from the per-platform pictures.
- A social failure never stops the post from being published.

## Before you publish

1. Fill the required fields above; the CMS tells you what is missing.
2. Paste the related product and tick **Main link**.
3. Add the cover and, for social, the pictures and text.
4. Publishers publish the post and, if wanted, tick **Approve for social**. A post can
   also have optional show-from and take-off times.
