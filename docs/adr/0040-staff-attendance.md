# ADR-0040: Staff attendance

## Status

Accepted (owner decision, 2026-10-20). Phone clock-in and manual attendance are built; terminal import and the phone-punch approval step are not started.

## Context

[ADR-0009](0009-gaa-staff-platform.md) planned "app-only clock-in" with no badge or access-control integration. GAA already uses a ZKTeco-style fingerprint and proximity-fob terminal, and the owner has decided that its punches should count. ADR-0009 is superseded by [ADR-0039](0039-gaa-staff-platform.md) and this ADR.

What exists in `apps/api/fastapi/src/hr/attendance/`:

- Manual attendance per roster assignment (`AttendanceRecord`, corrections, weekly PDF), approved by a supervisor through the `TIMESHEET` workflow ([manual-attendance.md](../hr/manual-attendance.md)).
- Phone clock-in (`clock_service.py`, `clock_router.py`): a static NFC or QR site token (`ClockSite`, hash only) proves presence, and `POST /api/v1/hr/attendance/clock` calls `save_attendance`, so roster, permission and revision rules are the manual ones ([contracts](../api/contracts.md#clock-in)).
- No code mentions ZKTeco, a terminal, device user IDs or a punch import (grep of `src/` found none).

## Decision

1. **Terminal punches count as official attendance.** Punches from the existing GAA fingerprint and fob terminal are imported and recorded without a separate approval step.
2. **Phone clock-in counts equally, but every phone punch needs supervisor approval before it counts.** Until approved it is pending and is not attendance, hours or timesheet input.
3. **One attendance journey.** Both sources feed the existing attendance record, roster check, revision rule and supervisor workflow ([end-to-end-alignment.md](../hr/end-to-end-alignment.md): hardware "must feed this same attendance journey rather than create another timesheet system"). One record counts hours once whichever source produced it.
4. **What must be built**
   - Terminal import. How punches leave the device (a file export, or an SDK or network pull) is **to be confirmed** with GAA and the device model. A pull would run as an ARQ job ([ADR-0038](0038-background-jobs.md)).
   - Device user ID to staff mapping, managed by HR, one device ID per person, with unmapped punches held for review rather than dropped.
   - De-duplication: the same device and punch time imports once (re-runs are safe), and a terminal punch and a phone punch close together for one shift produce one attendance record, not two.
   - An approval queue for phone punches in the supervisor's existing approval inbox, with the punch time, site and shift shown, and approve or reject audited. The phone endpoint stops writing straight into the attendance record and instead creates a pending punch.
   - Roster and timesheet: approved punches match the published roster shift as today. A terminal punch with no matching shift is flagged for HR, not invented into one.
5. **Pay rules stay out.** Overtime, break and compensation treatment remain in [the policy register](../hr/policy-rules.md).

## Consequences

- Staff who forget their phone or have none can still be counted through the terminal; this partly answers the "no-phone staff" gap ADR-0009 left open.
- Supervisors get a new queue for phone punches. The cost is their time; the gain is that a photographed tag cannot create attendance by itself, which closes the static-token risk accepted in ADR-0009.
- Changing the phone endpoint to "pending" is a behaviour change for any current users of `POST /hr/attendance/clock`; it needs an API-contract change and client regeneration (`api-change` skill).
- Importing a physical device brings data-protection duties for fingerprint-derived IDs: the import stores the device's user ID and punch time only, never biometric templates.
- Open: the device model and export or SDK route, the exact timestamp and timezone format it emits, and how GAA wants unmapped punches handled.
