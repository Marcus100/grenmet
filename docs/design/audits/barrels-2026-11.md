# Design audit: Barrels Grenada company homepage (2026-11)

**Status:** Phase 1 audit, read only. Nothing was changed in the app; every fix below is a proposal for the owner.  
**Owner:** Barrels Grenada engineering (design mastery programme, issue #1453)  
**Last updated:** 2026-11-23

## Scope and method

Surfaces audited, all in `apps/web/barrels` (barrels.gd, plain HTML and CSS on Cloudflare Pages): the home page, Services, Products, Contact, the not-found page and the first-visit privacy card. The subscription status page is noindex and was read from code only.

The rule for judging: a defect is a gap against the lane spec ([`docs/design/barrels.md`](../barrels.md)) or a rule from a design skill. The question asked of the whole site: can a business owner who has never heard of Barrels understand what it does and get in touch in under a minute?

Method:

1. Read the root and app `AGENTS.md`, the lane spec and the section "Reviewing or polishing UI: check these before reporting a gap" in `docs/agents/extended-rules.md`. Skipped everything already in issue 1688 and in pull requests 1694 and 1732 (none of which touch this app).
2. Checked where styles live. The shared layer `packages/ui/src/styles/app-feel.css` is **not** imported by this app (the rules file says so), so tap flash, `touch-action` and the reduced-motion override are not applied here. The site has no animation, so only the first two matter. Styles are in `style.css`; colour and type tokens are generated into `tokens.css` by `build.mjs`.
3. Read the page sources, `style.css`, the three partials and `vercel.json`, then applied web-design-guidelines, fixing-accessibility, mobile-native, refactoring-ui, emil-design-eng and break-ui. The motion skills found nothing: there is no motion.
4. Looked at the live production site (read only, no form submitted) with a scripted browser at 390 pixels (touch emulation) and 1280 pixels, light and dark colour preference, on the home, Services, Products, Contact and a missing page. The site is dark only by design, so the preference made no visible difference, as the lane spec intends. Screenshots are kept privately and are not committed.
5. Compared with two saved reference screens, for ideas only (see Inspiration).

How to read a finding: **Size** S is under half a day, M about a day, L several days or needs a decision. **INVISIBLE** means visitors would not see a difference in normal use; **VISIBLE** means layout, colour or wording changes, so the owner reviews it first.

## What is already strong

- **One clear page structure.** One first-level heading per page, a skip link, a main landmark, a labelled main navigation and visible keyboard focus (`a:focus-visible` draws a medium accent outline).
- **Forms are careful.** Visible labels, 44 pixel minimum field height, errors tied to fields and announced in a polite status region, a spam trap, a bot check and no native submit (so addresses never reach the web address).
- **The client boundary is stated honestly.** "Clients, not products" and text-only client names follow the owner's rule: no client logos, no certifications or partnerships claimed.
- **Search and sharing basics exist.** Canonical links, a description, Open Graph and Twitter titles, structured data listing the services, a sitemap that leaves out noindex pages.
- **Light and fast.** No framework, no web fonts, no third-party script except the bot check; no horizontal scroll at 390 pixels.
- **Honest product status.** Live and "Coming soon" products are labelled in words, and coming-soon entries carry no link.

## Findings

### Blocking

#### 1. The only way to get in touch is a form, so the "under a minute" test fails for anyone in a hurry

- **Where:** `contact/index.html` (the form is the entire page), the header (`partials/site-header.html`), the footer (`partials/site-footer.html`) and the home page, which offers "Contact us" only as a quiet outline button.
- **What happens:** no email address, phone number or WhatsApp link appears anywhere on the site (all pages searched for `mailto:`, `tel:` and chat links: none). The footer carries only the author's personal site. A visitor must type a name, an email, a subject and a message and then wait for a reply. The page does not say how fast Barrels replies.
- **Rule or reference:** web-design-guidelines (clear primary action, contact reachable from every page); Braintrust and Spellbook (see Inspiration) both keep a plain contact action in the header on every page. Small businesses in Grenada often prefer a phone or WhatsApp message to a form.
- **Why it matters:** this is the site's whole purpose. A prospective client who cannot get a quick answer leaves.
- **Suggested fix:** add a "Contact" action to the header on every page (a filled button, not a plain link), show the owner's chosen quick channels (email address, WhatsApp, phone if wanted) at the top of the contact page and in the footer, and say how soon a reply comes ("We reply within one working day", only if true). Which channels to publish is an owner decision. Size M. VISIBLE.

#### 2. A visitor cannot say from the first screen what Barrels does or who it is for

- **Where:** `index.html` hero: "Software-led technology for Grenada" and a lead that repeats it ("a software-led technology company for Grenada. We build software and our own products, and we provide the IT support that businesses rely on"). The file is marked draft copy.
- **What happens:** the heading names no outcome and no customer. The lead uses "software-led technology" twice, and what Barrels does is only understood after scrolling past 15 service tags and eight product cards.
- **Rule or reference:** refactoring-ui, hierarchy (one message, one action); Braintrust's hero is one plain sentence about the result plus two buttons.
- **Suggested fix:** the owner rewrites the heading as who it helps and what changes ("Websites, booking and IT support for businesses in Grenada"), keeps one sentence of proof (live products, clients by name in text) and makes the primary button "Contact us" with "See our services" as the quiet one. Size S for the layout; the wording is the owner's. VISIBLE.

#### 3. On a phone, the privacy card covers the hero and the Contact button on the first visit

- **Where:** `partials/privacy.html` and `.privacy-card` in `style.css` (fixed at the bottom with the page's side margins, full width on a phone).
- **What happens:** at 390 by 844 on a first visit the card sits over the end of the hero lead and the "Contact us" button (seen in the production screenshot), so the second action cannot be seen or tapped until a choice is made. The same card appears on every page for a first-time visitor.
- **Rule or reference:** lane spec: "keep it within the mobile viewport" (it does) and mobile-native: nothing should cover the main action on arrival.
- **Why it matters:** the one action this page exists for is the one hidden.
- **Suggested fix:** make the card a slim bar (one line of text and two small buttons; "Read more" opens the detail) or place it after the content flow; keep the lane spec's Accept, Deny and Read more choices. Size S to M. VISIBLE.

### Should fix

#### 4. Share previews are bare: no image, so a link in WhatsApp is plain text

- **Where:** the head of `index.html`, `services/index.html`, `products/index.html` and `contact/index.html`. There is no `og:image`, the Twitter card is `summary` without an image, and there is no apple touch icon or web app manifest; only `favicon.ico` exists.
- **Rule or reference:** web-design-guidelines, Metadata (a share image and icons).
- **Why it matters:** the owner shares barrels.gd in chats and with prospective clients; a card with the name and one line is more trustworthy than a bare address.
- **Suggested fix:** one 1200 by 630 image in the lane's navy with the Barrels name (no client logos), referenced from every indexable page by `build.mjs`, plus an apple touch icon. Size S to M. VISIBLE (in shares only).

#### 5. The 15 service tags look tappable but are not

- **Where:** the `.chips` section of `index.html` and `.chips li` in `style.css`: rounded outlined pills, the same shape as the quiet button. On a phone they take about five screens of scrolling to pass.
- **Rule or reference:** refactoring-ui and mobile-native: things that look like buttons must act like buttons.
- **Suggested fix:** link each tag to its section on `/services/` (the headings already exist; add `id`s) or turn the list into a plain two-column list with one short line each. Size S. VISIBLE.

#### 6. Trust is thin: no proof beyond the name

- **Where:** "Our work" shows three text cards with one-line descriptions; "Clients, not products" is a legal-sounding paragraph ("Software we build for a client is Barrels intellectual property licensed to that client").
- **What happens:** a prospective client reads the ownership rule before any proof of results. Two of the three work cards have no link. There is no named person, no business address and no short outcome.
- **Rule or reference:** owner rule: client names stay text only, never logos; claim nothing undocumented. Spellbook puts one attributed proof line next to the hero.
- **Suggested fix:** shorten "Clients, not products" to one line and move it lower; give each work card one factual outcome sentence the owner approves; add a "Who we are" line with the founder's name and Grenada address. Size M. VISIBLE.

#### 7. The home page is long and repeats the Products and Services pages

- **Where:** `index.html` lists all 15 services, all eight products and three clients (about 6,700 pixels tall at 390 pixels), then a newsletter form.
- **Why it matters:** a first-time visitor reads everything to find the contact option, and the newsletter form competes with the contact action at the bottom.
- **Suggested fix:** show four to six services as cards with "See all", the four live products, and one closing contact call to action above the newsletter. Do not hide the coming-soon list: it stays on `/products/`. Size M. VISIBLE.

#### 8. Header navigation does not show the current page and its tap size is unconfirmed

- **Where:** `partials/site-header.html`, `.nav-list` and `.brand` in `style.css`.
- **What happens:** three text links with no active-page marker (no `aria-current` in the partial), and their height comes from `padding-block` of the caption line height; I could not confirm it reaches 44 pixels (see "What could not be checked").
- **Rule or reference:** fixing-accessibility (mark the current page); mobile-native (44 pixel targets).
- **Suggested fix:** add `aria-current="page"` at build time with an underline on the current link, and a 44 pixel minimum height for header links. Size S. INVISIBLE for the attribute, VISIBLE for the underline.

#### 9. Touch base styles are missing here

- **Where:** `style.css` does not import `app-feel.css` (the rules file lists this app as an exception).
- **What happens:** buttons keep the default tap flash, there is no `touch-action: manipulation`, and `button` has no `:active` state, so a press looks like nothing happened until the form posts.
- **Suggested fix:** add the lines locally (`-webkit-tap-highlight-color: transparent`, `touch-action: manipulation` on links, buttons and fields, a darker `:active` background) without importing the shared file. Size S. INVISIBLE for the first two, VISIBLE for the pressed state.

### Nice to have

#### 10. Counts and wording differ between the page, the lane spec and the notes

The services page has 15 services; the lane spec says "ten services" and the app notes say "twelve services". The meta description says "software and IT services" while the home heading says "technology". The newsletter copy ("Occasional news") promises little; one line on what the letter contains would help. Size S. VISIBLE.

#### 11. The not-found page is one dead end

`404.html` shows "Page not found" and one button back to the home page. Add Services, Products and Contact links so a mistyped address still leads to the contact action. Size S. VISIBLE.

#### 12. The footer is thin

The footer holds the company name and the personal site link (the lane spec keeps the link). Add the contact line from finding 1 and a link to the privacy choices. Size S. VISIBLE.

## Inspiration

Ideas only; nothing here is to be copied.

- [Braintrust, home page](https://mobbin.com/screens/a18aa972-173e-48b3-b0f8-a499a8aadff0): one plain sentence as the heading, one sentence of explanation, two buttons side by side ("Start building" filled, "Contact sales" quiet) and a "Contact us" link in the header. Borrow the heading-plus-two-buttons shape and the always-present Contact in the header. Do not borrow the row of client logos under the hero: the company site keeps client names as text only.
- [Spellbook, home page](https://mobbin.com/screens/4d0d9296-19ab-41de-869a-12a86a955f29): a dark page with a quiet lead, a single filled "Book a Demo" button in the header and again in the hero, and one attributed proof line next to the picture. Borrow the repeated contact button and the single proof line. Do not borrow the stock photograph or the star rating, which Barrels cannot support.

## What could not be checked

- **Tap target sizes by measurement.** A scripted measurement run of the header and footer links was queued behind other agents' work on the shared heavy-job slot and was stopped, so link sizes are argued from the stylesheet only (finding 8).
- **A real phone.** Tap flash, tap delay and the on-screen keyboard were argued from the stylesheet and seen only in an emulated phone viewport.
- **Form success and failure states.** Nothing was submitted (read only), so the confirmation text, the bot check and the error messages were read from `forms.mjs` and the HTML only.
- **Subscription status page** (`/subscribe/status/`): noindex, and it needs a real confirmation link.
- **Analytics choice flow.** The card was seen on first load; Accept and Deny were not pressed.
- **A screen reader and the full keyboard route.** Reasoned from the markup, not run.
- **Contrast figures.** The accent on the dark navy was judged by eye and from the lane spec colours; no contrast tool was run.
