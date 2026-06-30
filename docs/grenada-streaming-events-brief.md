# Grenada Streaming & Events — Product Brief

> Status: **brainstorm / early product definition** (2026-06-30). This is a living document;
> decisions captured here are the result of a working session and several are still open
> (see [Open Questions](#open-questions)). Nothing here is built yet.

## TL;DR

A **media group** for Grenada with two consumer products under **separate brands** sharing one
technical and audience backbone:

| Product | What it is | Revenue |
|---|---|---|
| **Grenada Signal** | News / intelligence / culture **hub** (already in repo as `apps/web/signal`) | Sponsorship + B2B |
| **Streaming app** (`apps/pwa`, planned) | The **national media library of Grenada** — all Grenadian content | Subscription + (events) ticket fees |
| **Events app** | "Every event in Grenada" — what's-on directory + ticketing | Ticket fees |

The streaming and events products may live in the same `apps/pwa` PWA shell (decision open).
Grenada Signal stays a separate, deep-linked app. All three share **one account + subscription**.

Launch target: **Spicemas 2027 (~14 months out).** First thing to build: an **audio + offline-on-Android
vertical slice** to prove the subscription/transcode/offline loop (the technical moat).

---

## The empire structure

A media group with two divisions, separate consumer brands, shared backbone.

```
Parent media group (owner / EIC)
├── Signal Caribbean        → news / intelligence / culture · sponsorship + B2B
└── [Streaming + Events brand, unnamed] → entertainment / commerce · subscription + ticket fees

Shared backbone ("the one company" part):
  • tech infra + auth + monorepo
  • single account / audience graph / unified subscription
  • commercial / ad-sales (sells across both)
  • production studio (shared service: shoots Signal video AND streaming originals)
```

- **Same company, separate staff** per division. The org/staffing model is **still open**
  (see Open Questions).
- **Separate P&L** per division (founder's call — keep business modelling light for now).
- Brands are **separate and deep-linked**, not a single super-app, but a **shared account and
  subscription** spans all three products.

### The flywheel
- **Signal** runs *Events Signal / Weekend Signal / Culture Signal* editorially → links into the
  **events app** to buy tickets and into **streaming** to listen.
- **Streaming** artist profile → "playing a fete Saturday" → **events** ticket.
- **Events** → "stream this artist" → **streaming**.
- **Diaspora gifting** (events) is the bridge from the local-first launch to the diaspora audience.

---

## Product 1 — Streaming app

**Identity:** the national media library of Grenada → Caribbean eventually (far future).
Think a culturally-owned hybrid of Spotify + YouTube + Mixcloud, with a flagship radio channel.

### Content & supply
- **Content types:** everything Grenadian — music (soca / calypso / pan / gospel), podcasts &
  talk/radio, video shows / docs / concerts, church / community. (Live streaming is **much later**.)
- **Who uploads:** **verified creators only** — apply / verify as a Grenadian creator, then self-serve.
- **The subscription moat:** not "Spotify for Grenada" (can't out-license the global platforms).
  The reason to pay is **exclusive, owned, original content that exists nowhere else** — recorded
  fetes, live sessions, docs, archives — produced by the shared studio pod. The catalog is bait;
  the originals are the reason to subscribe.

### Monetization
- **Subscription ~$5 XCD/month + free trial.** Cheap by design.
- **Free funnel = the radio channel; paid = on-demand.** The 24/7 linear "Grenada Radio" stream is
  **free** (lean-back, data-light, no decisions); a subscription unlocks **on-demand play, offline,
  and skips.** Radio *is* the funnel.

### Discovery
- 🚩 **24/7 "Grenada Radio" linear channel — flagship feature.** Auto-programmed from the catalog
  with day-parts (gospel Sunday morning, soca drive-time, late-night calypso), DJ takeovers,
  Spicemas road-march countdown. Plays to a radio culture; lowest-friction, lowest-data way to
  expose the whole library.
- **Editorial "Signal Picks"** — human-curated playlists / featured shows (leans on newsroom muscle).
- **Grenada charts / trending** — Top 10 soca, trending now (in a small market, being #1 is
  achievable → real creator dopamine hook).
- **Spicemas / season mode** — app transforms for Carnival.
- **Follow creators + personal feed** — new-drop notifications.
- **Archive / "on this day"** — calypso & Spicemas heritage; ties to the wiki's Caribbean-history
  material; makes the app Grenada's *cultural memory* (uncopyable by global platforms).
- **Occasion/mood rows in local language** — "Cook-up Sunday," "Road March," "Church House."
- **New-drop rhythm** — a fixed weekly moment ("New Music Friday Grenada").
- **Parish & Spicemas tagging** — browse "Sounds of St. Patrick," "last year's J'ouvert."
- **WhatsApp-first sharing** — deep links so a shared track opens in-app (WhatsApp is the real
  social graph).

### Social
- **Light social:** follow creators, like, share-to-WhatsApp, comments. Enough for a retention loop
  without a moderation nightmare.

### Creator portal
- **Baseline:** upload & manage catalog, analytics (plays/listeners by parish + diaspora city),
  earnings & payouts, promo tools (pre-save, share cards, link-in-bio, fan notifications).
- **The differentiators vs YouTube/Spotify:**
  - **Real local payouts with a low/no threshold** — global platforms strand small Caribbean
    creators behind $50–100 minimums and rails that barely work locally. Pay out in XCD/USD via
    locally-real rails with a low threshold = the killer reason to upload here first.
  - **Pitch-to-editorial** — submit a track for Signal Picks / charts / radio rotation.
  - **Profile doubles as a booking EPK** — cross-links to the events app ("book me" / "playing
    Saturday").
  - **Catalog import** from YouTube/Audiomack/Spotify to kill the cold-start.
  - **Verification / anti-impersonation** — protects the "verified creators only" gate.
- **Royalty splits: skipped for now** — the uploader handles collaborator splits offline.
  (Revisit later as a fairness/trust feature for collaborative soca.)

### First-run aha
- **Tap once → Grenada Radio plays.** Instant local music, zero setup.

---

## Product 2 — Events app

**Scope:** *every event in Grenada* — fetes / soca, concerts / shows, community / church / sports,
food & lime / experiences. Comprises the **what's-on directory** (free funnel) + ticketing +
promoter tools.

### Attendee experience
- **Browse:** **this weekend / today** (hero feed) + **parish / category filters** + **save & remind /
  notify.** **Map view** as a fast-follow (delightful and genuinely complete on a small island).
- **Free + paid:** free events list with **RSVP**; paid events sell tickets. Truly "every event."

### Tickets & the gate
- **v1: static QR + online check-in**, hardened cheaply:
  - **scan-and-burn** (first scan marks used; later scans flash red),
  - **buyer name/photo on the scanner** so the doorman catches mismatches.
- **Offline scanner from day one** — caches the guest list before doors, reconciles after.
  Non-negotiable: country fetes have no signal.
- **Dynamic / rotating QR:** phased later (stronger anti-screenshot).

### Payments
- **Everything Grenada uses, phased:** cards / Apple-Google Pay (diaspora) → **cash-at-door in-app**
  (keeps door sales in the system) → bank transfer / agent / voucher (reaches the unbanked) →
  mobile money.

### 🎁 Diaspora gifting — signature feature
- Buy a ticket from abroad → recipient gets it on their phone → walks into the fete. Solves a
  cross-border pain nobody addresses; the bridge to the diaspora audience.

### Promoter portal
- Create & manage events (tiers, pricing, capacity, flyer), **offline scanner app**, real-time sales
  + payouts, guest lists & comps / door-staff accounts.
- **Payout model: held in escrow until after the event** — protects buyers from no-show events and
  builds buyer trust (promoters wait).

### Revenue
- **Ticket fees.** Browsing the directory is free (the funnel).

---

## Technical architecture (decisions so far)

- **Clients:** **Next.js PWA only**, living at **`apps/pwa`** in this monorepo. Reuses `@grenmet/auth`,
  `@grenmet/ui`, Drizzle, DO Spaces, and the existing Redis/worker infra ("shared backbone" done
  literally).
- **Offline media:** **core feature, Android-first.** Full download/offline on Android (the local
  launch audience skews Android); **iOS degraded** at launch (PWA offline is weak on iOS —
  no Background Fetch, evictable storage) — revisit for the iOS-heavy diaspora later.
- **Streaming delivery — hybrid:**
  - **Audio: self-host** — transcode in the ffmpeg worker → DO Spaces + CDN. The same file is the
    offline download. Cheap, full control, offline-easy.
  - **Video: managed (Cloudflare Stream)** for online adaptive streaming, **plus a self-hosted MP4
    rendition for offline.** Avoids building a video pipeline on day one.
  - Note: adaptive HLS is great for streaming but painful to download → produce **two renditions**
    (HLS stream + progressive MP3/MP4 for offline).
- **Content protection — phased:** v1 plain cached files (treat leakage as marketing for cheap local
  content) → v2 encrypt-at-rest in IndexedDB → DRM only if a rights-holder ever forces it.

---

## Build sequencing

1. **First / learning demo:** audio + offline-on-Android vertical slice — one artist, a few tracks,
   play offline with data off. Proves subscription + transcode + offline (the moat) and teaches the
   whole pipeline.
2. **Streaming core:** radio channel (free funnel) + on-demand (paid) + verified-creator upload +
   basic discovery.
3. **Events:** what's-on directory (free) → ticketing + offline scanner → diaspora gifting.
4. **Cross-app:** shared account/subscription, deep links, Signal ↔ streaming ↔ events flywheel.

Target moment: **Spicemas 2027.**

---

## Open questions

- **Org / staffing model** — "same company, separate staff" agreed, but how the division actually
  staffs and runs day-to-day is unresolved.
- **Brand name** for the streaming/events product ("fully separate brand", currently unnamed).
- **One `apps/pwa` shell for both streaming + events, or two apps?** (Both are separate from Signal.)
- **Data model / core entities** — not yet sketched (creators, content, tracks/episodes,
  subscriptions, plays; events, tickets, orders, gifts, scans, payouts).
- **Payment & payout rails detail** — which local providers, escrow mechanics, cash-out flow.
- **iOS offline** — acceptable launch degradation agreed; revisit approach (e.g. Capacitor shell)
  for the diaspora.

---

## Decision log (what's settled)

| Area | Decision |
|---|---|
| Audience order | Local "what's on" first; diaspora is the grow-into audience |
| Curation model | Hand-picked / verified-creators-only (not open marketplace) |
| Signal relationship | Separate apps, shared backbone + shared account/subscription |
| Music depth | Hosted streaming, subscription-funded |
| Subscription price | ~$5 XCD/month + free trial |
| Free vs paid (streaming) | Radio free → on-demand paid |
| Streaming flagship | 24/7 Grenada Radio linear channel |
| Live streaming | Much later |
| Social | Light (follow/like/share-to-WhatsApp/comments) |
| Royalty splits | Skipped for now (uploader handles offline) |
| Clients | Next.js PWA only, `apps/pwa` in monorepo |
| Offline | Core, Android-first; iOS degraded at launch |
| Delivery | Hybrid: self-host audio, managed (Cloudflare Stream) video |
| Content protection | Phased: plain → encrypt-at-rest → DRM only if forced |
| Events scope | Every event in Grenada; free RSVP + paid |
| Events browse | This weekend/today + filters + remind; map fast-follow |
| Gate | Static QR + online check-in v1; offline scanner from day one |
| Payments | All Grenada rails, phased (cards → cash-at-door → transfer/agent → mobile) |
| Diaspora gifting | Signature feature |
| Promoter payout | Escrow, held until after event |
| Launch target | Spicemas 2027 |
| First build | Audio + offline-on-Android demo |
