# Printix operations brief pilot

**Status:** Pilot procedure

**Owner:** Barrels Grenada operations

**Last updated:** 2026-11-19

Compare a fixed template with an AI-assisted brief at the 14 December rehearsal
and the 26 December event. The organiser and gate lead run the
[Printix rehearsal checklist](./printix-rehearsal-checklist.md) as usual.
The assigned pilot lead collects evidence, checks both drafts and records the
result. The organiser still makes the event decisions.

## Capture evidence

Make one JSON packet for each readiness or closeout checkpoint. Record the date
and checkpoint in the internal evaluation log. Use `pass` for a verified check,
`blocked` for a known unresolved problem and `unknown` when the evidence is
missing or does not establish the result. Omitted checks also become Unknown.
Write counts as whole decimal numbers using digits. Set a count to zero only
if someone verified zero. Leave an unverified count out.

| Checkpoint | Check keys and evidence |
| --- | --- |
| Readiness | `staff_access` from sign-in checks, `event_setup` from the verified organisation, event date and scheduled closing time, `ticket_import` from the trial and import result, `device_test` from actual phones, `gate_pairing` from valid and repeated test scans, `offline_fallback` from an offline test or a fallback agreed for gates without signal |
| Closeout | `event_closed` from the organiser's confirmation of manual close, `phones_synced` from checking every phone before unpairing, `report_reviewed` from the event report and exception review, `gate_codes_cancelled` from checking remaining gate codes after closeout |

Closeout also accepts these optional aggregate integers in `counts`.

- `admitted` comes from the event report.
- `pending` is the total queue count across all gate phones.
- `conflicts` is the total offline conflicts reported by gate staff.

Check queues on every gate phone before unpairing and record conflicts before
staff clear them. Mark sync Blocked if a phone is known to have lost queued
admissions. If a phone was reset before it was checked, mark sync Unknown and
omit any aggregate the operator can no longer verify. The organiser confirms
manual closure separately from the scheduled closing time.

Use the operator’s verified observations for these values. The packet format
accepts check statuses and aggregate counts only. Keep names, ticket numbers,
barcodes, gate codes, notes and raw scan exports in their originating systems.
Store live packets and reviews in the team's private working location.

## Run both drafts

Run these commands from the repository root for a dry run with
[synthetic readiness evidence](../../scripts/ops/fixtures/printix-readiness.json)
and [synthetic closeout evidence](../../scripts/ops/fixtures/printix-closeout.json).

```bash
node scripts/ops/printix-brief.mjs scripts/ops/fixtures/printix-readiness.json
node scripts/ops/printix-brief.mjs scripts/ops/fixtures/printix-closeout.json --prompt
```

For either checkpoint, run the command twice against the same private packet.
The first run prints the deterministic brief. Add `--prompt` to the second run
to generate the model instructions and the identical evidence, then run the
prompt once in the approved AI tool. The command itself reads only the supplied
packet and writes to standard output. If the AI tool is unavailable, record
that run as unavailable and keep using the template.

## Score the comparison

Record evidence collection time once for each checkpoint. Time each draft
independently through operator review and correction. Record any generation
wait that blocks work as part of elapsed time. Score each original draft against
the same packet before correcting it, then include correction time in the total.
A missed exception is any Blocked or
Unknown check the draft omits or wrongly treats as cleared. An unsupported claim
includes a wrong count or a readiness or closeout decision presented as settled.

| Date and checkpoint | Method | Draft + review + correction (minutes) | Missed exceptions | Unsupported claims | Model/version and cost if known | Accepted |
| --- | --- | --- | --- | --- | --- | --- |
| | Template | | | | | |
| | AI assisted | | | | | |

For AI-assisted drafts, record the prompt version, model or tool, and any
correction category. Use the template whenever the AI draft misses an
exception, changes a fact or needs more operator time. Review the paired
results after the event. Continue the AI trial only if the reviewed drafts
cover every exception, preserve the verified facts and reduce total operator
time once review and correction are counted.
