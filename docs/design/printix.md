---
colors:
  ink: "#0b0d0c"
  surface: "#181b1a"
  rule: "#2c312f"
  paper: "#f4f6f3"
  muted: "#9aa39d"
  green: "#7ed321"
  valid: "#2a9632"
  stop: "#b91c1c"
---

# Printix Scanner

The ticket scanning app for Printix, the security-printed ticket product run as
a collaboration with Barrels Grenada (`apps/pwa/printix`). Printix keeps its own
name and look, with Barrels shown where it helps (for example on sign-in). No GAA
or GMS marks, and no `--gm-*` tokens.

One dark look only. Gate staff work at night, a dark screen saves battery, and
the result colours must read at arm's length. Near-black `ink` background,
slightly lighter `surface` panels, `paper` text and `muted` secondary text.
`green` is the brand accent from the client's flyer: the scan frame, the main
button and links. `valid` and `stop` are result colours and are never used for
decoration: `valid` fills the screen for a ticket that may enter, `stop` for
one that may not.

Type is Inter throughout; ticket numbers and barcode values are set in the
system monospace face so similar characters stay distinct. Buttons are large
(at least 44 px tall) and sit within thumb reach. Keep focus visible on every
control. The camera view is wider than tall, because the tickets carry a
barcode of lines.

Signal is always shown above the count: a dark "Online" pill with a green dot,
or a light "Offline" pill with a red dot, so the change reads at arm's length.
Next to it, "N admissions waiting to send" (offline) or "sending N" (online).
Below, the saved ticket list's download time, or the notice that offline
checking is not available for this event. Conflicts sit in a disclosure under
it, in plain sentences. An admission made with no signal is the same green
result, with a line saying it will be sent later.

Motion follows how often a thing happens. The result screen appears hundreds
of times a night, so it never animates. A screen that replaces another
(pairing, problem, scanning) fades in over 200 ms (`.pwa-screen` from the shared phone-app kit, opacity only).
The typed-number sheet is occasional: it slides up, follows the finger and can
be dragged down to close (the kit's sheet, built on Vaul). Buttons press in slightly. Nothing bounces.

Organiser screens (`/organiser`, `apps/pwa/printix/src/organiser`) keep the same
dark look and colours, and add two layout rules. They are laptop first: one
column, at most about 48 rem wide, centred, so a laptop does not stretch rows
across the screen. They also work on a phone at 375 px: every control is at least
44 px tall, and every input is 16 px, so iPhone does not zoom. Errors are one
plain sentence in the alert colour, announced to screen readers, with focus put
back on the field that needs fixing. Labels are always visible; placeholders
never replace them.

Organiser setup (`/organiser`, event page) adds two layout rules. Setup actions
are inline sections on the event page, not pop-up dialogs, so a phone never stacks
a dialog on top of a keyboard. The gate code is the one exception to the look of a
list: a full-width panel, with the QR code on a light card (the `px-paper` colour,
dark `px-ink` modules, so a camera reads it) and one "Done" control. A destructive
step (void, cancel a gate code, close the event) always asks first in a sentence that
says what happens, with a "keep it" control beside the confirm.

Organiser dashboard (event page, "Live at the gates" and "After the event"): the same
one column and surface cards. Every part is always shown; a part with nothing to count says so
in one sentence. The arrivals chart is plain SVG bars in `green`, the busiest bar in `paper`,
with a sentence beside it and a table behind a disclosure, so it never depends on colour or
sight. `stop` is not used on the dashboard: a quiet gate phone is a bold sentence ("has not
scanned for 25 minutes. Check it."), because `stop` belongs to refusal results. Times are
Grenada time and "ago" is measured from the server's clock.

Source: `apps/pwa/printix/src/styles/app.css`.
