# Printix rehearsal and event checklist

**Status:** Active guide  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-19

For Barrels and Printix staff running the rehearsal on 14 Dec 2026 and the event on
26 Dec 2026. Plain steps, in order. Tick each one off. Every screen name and button below
is the one on the screen today. The scanner is at `scan.barrels.gd`; the organiser screens
are at `scan.barrels.gd/organiser`.

Two roles are used. An **organiser** sets up events, imports tickets, voids tickets and
makes gate codes. A **gate lead** can only make and cancel gate codes. Gate staff need no
sign-in: their phone is paired with a gate code.

Use the [operations brief pilot](./printix-operations-brief-pilot.md) to compare
readiness and closeout summaries from recorded rehearsal evidence.

## Before the day

### 1. Access (a Barrels administrator)

- [ ] Give the organisation and each person their access. Follow
      [printix-onboarding.md](printix-onboarding.md): admin.barrels.gd, the Printix
      organisation, App access, then "Printix access" and "Add person to Printix".
- [ ] Each person has a Barrels account and **adds an authenticator** at
      auth.barrels.gd/security. Without one, sign-in at the scanner is refused.
- [ ] Each person signs in at `scan.barrels.gd/organiser`: type the email, tap "Send the
      code", then type the 6-digit code from the email and the 6-digit code from the
      authenticator app, and tap "Sign in". A sign-in lasts at most 12 hours.

### 2. The event (an organiser)

- [ ] Choose the organisation if asked. On the events screen tap "New event".
- [ ] Give the name, the event date and the closing time (Grenada time), then tap
      "Create event". The event date can be at most one year ahead. The closing time cannot
      be before the event date and can be at most seven days after it.
- [ ] Open the event. The page shows the sections Gate codes, Tickets, Import tickets and
      Close event, and the live and after-event numbers.

### 3. Tickets (an organiser)

The printer sends a CSV file (up to 2 MB). It needs a header row with a `number` column
(the printed number) and a `barcode` column (what the scanner reads). Every row needs a
barcode. "Download a small sample file" on the Import tickets section shows the shape.

- [ ] In Import tickets, choose the file and tap "Check the file first". This is the trial:
      it writes nothing.
- [ ] Fix every problem it lists, ask the printer for a new file, and check again. A blank
      barcode blocks the import.
- [ ] Read the offline warning, if any. **Every barcode must be at least 12 characters long
      and must differ from the printed number.** If any one is not, the warning says
      "Offline checking will be off for this event." The import still works and phones can
      still check tickets, but only with signal. Ask the printer to fix the file if you
      want offline checking.
- [ ] When the trial is clean, tap "Import N tickets". The page then says "Imported N
      tickets."
- [ ] Look at the Tickets list: the count and a few printed numbers are right.

### 4. Gate codes (an organiser or a gate lead)

Make **one gate code per gate phone group**, one gate name each, such as "North gate". At
most 20 gate codes can be active for one event.

- [ ] In Gate codes, tap "New gate code". Type the "Gate name".
- [ ] "Works until" can stay blank (it then works until six hours after the event closes).
- [ ] "Allow typed numbers" is for organisers only and is off by default. Leave it off unless
      the gate needs it. Typed numbers are checked only with signal.
- [ ] Tap "Make gate code". The QR code is shown **once**, full width. Scan it with the
      gate phone's camera straight away. It hides after two minutes, when you tap "Done",
      or when the page is hidden, and it cannot be shown again. If you miss it, cancel that
      code and make another.
- [ ] A gate code is a password. Never send it by chat or email. Show it only to the phone
      it is for. If one leaks, tap "Cancel code" next to it and then "Yes, cancel it" (or
      "Keep it" to go back).

### 5. Phones (each gate person, on their own phone)

- [ ] **Android:** open `scan.barrels.gd` in Chrome. Open the browser menu, then "Install
      app" or "Add to Home screen".
- [ ] **iPhone:** open `scan.barrels.gd` in Safari. Tap the Share button, then "Add to Home
      Screen".
- [ ] **iPhone warning:** Safari and the Home Screen app keep their data apart, and the
      scanner is paired by opening the gate code from the phone's camera, which opens a
      browser, not the installed app. The scanner has no screen to type a code. So a phone
      paired in Safari is not paired in the Home Screen app. Test this on a real iPhone at the
      rehearsal and write down which way worked. If the Home Screen app cannot be paired, use
      the scanner in a Safari tab on that phone. Safari deletes a site's saved data and
      cached app after about 7 days without use, so open the scanner online in the week
      before the event.
- [ ] Open the app online once, pair it (see "On the day"), and wait until the line under
      Online/Offline says "Ticket list from <time>". Do this at least a day before the event.
- [ ] **Charge every phone** to full, and bring a power bank. The scanner keeps the screen
      awake, which uses battery.
- [ ] **Test the venue's signal** with the real phones, standing at each gate. Watch the
      Online/Offline badge. Note any gate where it says Offline.

## On the day

### Pair the phones

- [ ] A gate lead or organiser opens the event, taps "New gate code" for each gate and
      shows the QR code to that gate's phone.
- [ ] The phone's camera opens the link and the scanner starts: it shows "Paired", the event
      name, the live count, and the "Start scanning" button. Tap "Start scanning" to turn
      the camera on.
- [ ] Scan one valid test ticket. The screen turns green and says "Admitted". Scan the
      same ticket again: a red "Already admitted" screen shows the time and gate.
- [ ] Check that the badge says Online and that the ticket list has a download time.

### Watch the live dashboard (an organiser)

Open the event page and look at "Live at the gates". It refreshes every 10 seconds.

- [ ] Each gate shows people let in, refused, the share typed by hand and its last scan.
- [ ] **Quiet-gate warning:** a phone with no scan for 15 minutes while the event is open
      shows "Phone N has not scanned for N minutes. Check it." (or "This phone ..." when a
      gate has one phone). Call the gate. The phone may be asleep, out of battery, on
      another page or unpaired.
- [ ] The Refused section lists why scans were refused: Already in, Void ticket, Not
      recognised, Event closed. A burst of "Not recognised" often means the wrong event's
      tickets or a gate where typed numbers are off.

### Typed numbers

- [ ] If a barcode will not scan, tap "Type a number", type the printed number (up to six
      digits) and tap "Check ticket".
- [ ] A typed number works only if the gate code was made with "Allow typed numbers" on
      and only with signal. If it says "Not on this event", check the number, then check
      that typed numbers are on for this gate.

### A phone has no signal

- [ ] The badge says Offline. Barcodes are still checked from the ticket list saved on the
      phone, and the screen says the admission "will be sent when the signal is back".
- [ ] Typed numbers cannot be checked with no signal ("No signal: typed numbers cannot be
      checked"). Scan the barcode, or use the paper list.
- [ ] If the badge says "Offline checking is not available for this event", the barcodes were
      too short or equal to the printed numbers (see Tickets above). With no signal the
      screen says "No signal: cannot check tickets". Use the paper list.
- [ ] Do not unpair a phone while "N admissions waiting to send" is showing: unpairing
      deletes them. Move to where there is signal and wait until none are waiting.
- [ ] "Conflicts" on the phone means someone was let in with no signal but the server did not
      record it (for example, the ticket was already used at another gate). Tell the
      supervisor, then tap "Supervisor told: clear the list".

### Void a lost ticket (an organiser)

- [ ] On the event page, in Tickets, find the printed number. Tap "Void ticket", then "Yes,
      void it". The ticket is then refused at the gate. A ticket that has already been
      admitted cannot be voided.
- [ ] A phone offline will not know about the void until it gets signal and refreshes its list
      (about every 5 minutes).
- [ ] To undo it, tap "Restore ticket", then "Yes, restore it".

### What each screen means

| Screen | What it means | What to do |
| --- | --- | --- |
| Green "Admitted" | Valid ticket, first time | Let them in. It clears by itself. |
| Red "Already admitted" | Ticket used before; it says when and where | Do not admit. Tap "Scan next". |
| Red "Void ticket" | An organiser voided it | Do not admit. Send them to the organiser. |
| Red "Not a ticket" or "Not on this event" | Barcode or number is not for this event | Do not admit. Check the ticket is for this event. |
| Red "Not on the ticket list" | Offline only: not on the phone's saved list | Scan again where there is signal. |
| Red "Event closed" | The event is over | Do not admit anyone. |
| Red "Too many scans" | The phone scanned too fast | Wait the seconds shown, then scan again. |
| Grey "No signal: cannot check tickets" | Nothing was checked | Move to signal, or use the paper list. Scan again. |
| Grey "Could not check this ticket" or "Value not read" | The answer or the read failed. Nothing was checked | Scan again, or type the number. |
| Grey "Pairing not recognised" or "Pairing no longer valid" | This phone's pairing was removed, revoked or has expired | Tap "Unpair this phone" and pair again with a new gate code. |

Red and grey result screens stay until you tap "Scan next". The pairing screen stays until you tap "Unpair this phone".

## After the event

- [ ] **Close the event** (an organiser): in Close event, confirm with "Yes, close the
      event". It cannot be undone and gate codes stop admitting people. Do this only after
      the last guest is in.
- [ ] **Let phones send.** Phones that were offline send their waiting admissions when they
      have signal. Wait until every phone shows nothing waiting to send, then you can unpair
      them.
- [ ] **Download the scan list:** in "After the event" tap "Save the scan list". It saves a
      CSV file named `printix-scans-<event date>.csv` with every scan: time, gate, printed
      number, what happened, whether it was typed or sent late. Keep it private; it has
      printed numbers.
- [ ] **Read the report** in the same section: tickets issued, void tickets, people let in,
      no-shows, first and last let in, the busiest 15 minutes, and the share of arrivals by
      gate. After closing, the numbers are final.
- [ ] Cancel any gate code still active, and tell staff to delete the app if the phone is
      shared.

## If something goes wrong

| Problem | Check | Fix |
| --- | --- | --- |
| Cannot sign in at the organiser address | The person has a Barrels account, an authenticator and Printix access | Redo step 1. "Cannot sign in" next to the name in admin means the sign-in role is missing. |
| "Your session has ended" | Sign-in lasts 12 hours, or the connection dropped while renewing | Sign in again. Use one browser tab per person. |
| No "New event" or import buttons | The person is a gate lead | Use an organiser. |
| Import will not start | Blank barcodes, a problem row, or a file over 2 MB | Read the "Problems to fix first" list and ask the printer for a new file. |
| "Offline checking will be off" | Barcodes under 12 characters or equal to the printed number | Ask the printer to fix them, or accept online-only checking. |
| QR code is gone or the phone missed it | It is shown once | Cancel the code and make a new one. |
| Pairing link says "not valid" | The link was cut off or copied wrongly | Make a new gate code and scan it directly. |
| 20 active gate codes | The limit per event | Cancel an old code first. |
| Camera will not start | The page is not on https, or camera permission was refused | Open `scan.barrels.gd` and allow the camera in the browser settings. |
| "This scanner is not connected to its server" | The build has no server address | Stop and call Barrels engineering before the gate opens. |
| A gate shows "has not scanned for N minutes" | Phone asleep, flat, offline or unpaired | Call the gate and check the phone. |
| Typed number says "Not on this event" | Wrong number, or typed numbers off for this gate | Check the number. Make a new gate code with "Allow typed numbers" on, or scan the barcode. |
| "Too many scans" | One phone scanned about 120 times in a minute, or typed numbers more than 20 a minute | Wait the seconds shown. |
| Phone paired in Safari, not in the Home Screen app (iPhone) | They keep separate data | See "Phones" above. |
