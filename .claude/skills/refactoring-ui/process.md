# Starting from scratch

How to begin a surface that does not exist yet. Once something is on screen, work the ladder in [SKILL.md](SKILL.md) instead.

## Start with a feature, not a layout

"Designing the app" really means designing the shell — top nav or sidebar, container or full width, where the logo goes — and you cannot answer any of it before you know what the app does. An app is a collection of features.

Start with one real piece of functionality and design what it needs. For flight search: departure city, destination city, departure date, return date, a search button. That is enough to begin. The shell falls out of a few features later, and some of it turns out to be unnecessary.

## Detail comes later

Typefaces, shadows and icons will matter, but not yet. If working in the browser makes it hard to ignore them, sketch — a thick marker makes fussing impossible.

**Hold the colour.** Designing in grayscale forces spacing, contrast and size to carry the hierarchy. It is harder, and it produces a clearer interface that colour later enhances rather than props up.

**Do not over-invest.** Low fidelity exists to move fast. Sketches are disposable and users can do nothing with a static mockup — explore, decide, discard.

## Do not design too much

Working out how every feature interacts and how every edge case looks, purely in the abstract, is where design stalls. How does this screen look with 2000 contacts? Where does the error message go? What about two events at the same time?

**Work in cycles.** Design a simple version of the next feature, build it, and iterate on the working thing. Unexpected complexity is the point — it is far easier to fix a design problem in an interface you can use than to imagine every case in advance. When the problems are gone, go back to design mode for the next feature.

**Be a pessimist.** Do not imply functionality you are not ready to build. Designing file attachments into a comment system on day one means that when attachments turn out to be expensive, the whole comment system waits — even though comments without attachments would have shipped and been useful. If part of a feature is a nice-to-have, design it later.

## Choose a personality

Personality sounds vague but is decided by four concrete things:

- **Font.** A serif reads elegant or classic; a rounded sans reads playful; a neutral sans stays out of the way and lets other elements carry the personality.
- **Colour.** Skip the psychology literature and pay attention to how a colour feels to you. Blue is safe and familiar; gold reads expensive; pink reads fun and unserious.
- **Border radius.** Small radius is neutral. Large radius is playful. Zero is serious and formal. **Stay consistent** — mixing square and rounded corners in one interface looks worse than either choice alone.
- **Language.** The words are everywhere in the UI, and impersonal versus friendly copy shifts the feel as much as any visual choice.

If you have no gut feeling, look at the other sites your audience already uses — but do not borrow from direct competitors, or you look like a second-rate version of them.

For this repo the personality is already set: Inter, the `--brand-*` palette, `--radius: 0.5rem`. Changing any of it is a token change requiring approval.

## Limit your choices

Unlimited options make decisions torture, because there is always more than one right answer — you cannot confidently choose between two button colours you cannot tell apart.

Define systems in advance and choose from them: font size, weight, line height, colour, margin, padding, width, height, box shadow, border radius, border width, opacity. Do the hard work of picking values once instead of every time.

You do not have to define everything up front. Just work with a system-focused mindset: when you catch yourself labouring over a low-level value, that is the signal to make a system out of it, and never make the same minor decision twice.

This repo's systems, and what to do when a value is missing from one, are listed in [SKILL.md](SKILL.md).
