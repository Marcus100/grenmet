---
colors:
  ink: "#0b0d0c"
  surface: "#181b1a"
  rule: "#2c312f"
  paper: "#f4f6f3"
  muted: "#9aa39d"
  green: "#7ed321"
  valid: "#2a9632"
  stop: "#d43a45"
---

# Printix Scanner

The ticket scanning app for Printix, a client's secure event ticketing product
(`apps/pwa/printix`). Printix appears as its own product: no Barrels, GAA or
GMS marks, and no `--gm-*` tokens.

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

Source: `apps/pwa/printix/src/styles/app.css`.
