# ADR-0023: Require Approval By A Different Person Before CAP Publish

## Status

Accepted - 2026-10-18 by the project owner. Supersedes
[ADR-0013](0013-cap-alert-self-publish-and-bulletin-linkage.md) decisions 1 and 2
(self-publish; review optional). The bulletin-linkage decisions in ADR-0013 stand.
Restores the approval gate of [ADR-0007](0007-cap-warning-lifecycle.md) with an
audited emergency exception.

## Context

ADR-0013 let one forecaster publish a CAP alert straight from Draft. CAP alerts
reach the public and partner agencies, so a single compromised or mistaken
account could issue a false warning with no second check. The owner decided that
approval by someone other than the author is required, that only a named duty
supervisor may bypass it in an emergency, and that anyone who can approve or
publish must use privileged MFA.

## Options

1. Keep self-publish (ADR-0013). Fastest, but no second pair of eyes.
2. Always require approval, no exception. Safe, but a single unreachable approver
   blocks a time-critical warning.
3. Require approval, with an audited emergency publish limited to one role.
   Chosen.

## Decision

1. **Normal publish needs state `APPROVED`**, and the latest `approve` audit event
   must be by a user other than the author. Self-approval is always refused; the
   legacy `allow_self_approval` policy flag no longer relaxes this for CAP.
2. **Editing a Submitted or Approved alert returns it to Draft**, so approval
   always covers the content that is published.
3. **Emergency publish**: new permission `cap.alert.publish_emergency`
   (role `cap-duty-supervisor`) on `POST /api/v1/cap/alerts/{id}/emergency-publish`.
   It accepts Draft, Submitted or Approved alerts and requires a non-empty
   `reason`. It writes an audit event `emergency_publish` with the reason and
   `emergency: true` and the snapshot id in its payload; the reason is also the
   event note.
4. **Privileged MFA** applies (in `enforce` mode and in the readiness report) to
   holders of `user.manage`, `cap.alert.approve`, `cap.alert.publish` and
   `cap.alert.publish_emergency`.
5. Cancel and expire are unchanged (`cap.alert.publish`).

## Consequences

- Publishing needs two people in normal operation; small shifts must have an
  approver on call, or the duty supervisor uses emergency publish.
- Emergency publishes are visible in the audit history and should be reviewed
  after the event. No schema change was needed.
- Existing Draft or Submitted alerts must be approved before they can be published.

## Amendment 2026-10-23: the author may approve; reviews are optional

Decided by the project owner on 23 October 2026, in conversation with the agent.

- The author of a CAP alert **may approve it themselves**. `approve_alert` no
  longer refuses the author, and `publish_alert` needs a recorded approval by
  anyone, not "someone other than the author".
- An independent check stays available as an **optional review**: after the
  author submits ("Request review"), another CAP user holding
  `cap.alert.approve` may record `reviewed` or `changes_requested` with a note
  (`POST /api/v1/cap/alerts/{id}/reviews`). The author cannot review their own
  alert. A review never changes the state or blocks approval or publication.
- Unchanged: the `DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED` lifecycle, the
  separate `cap.alert.approve` and `cap.alert.publish` permissions, MFA for
  privileged CAP actions, the audited emergency publish, and editing a
  Submitted or Approved alert returning it to `DRAFT`. Every approval and review
  is in the audit history.
- Consequence: one person can now take an alert from draft to published when
  they hold both permissions. Reviews and the audit history are the remaining
  check; GMS decides who holds `cap.alert.approve` and `cap.alert.publish`.
- Not changed by this amendment: hazard profile versions still need approval by
  someone other than their author.
- Follow-up for the owner: `apps/api/fastapi/src/cap/AGENTS.md` still says
  self-approval is always refused; that file is owner-only.

## Amendment (2026-10-25): the author may approve their own alert

The owner confirmed that for GMS a single forecaster can issue an alert, so the
requirement that approval comes from someone other than the author is removed.
Approval is still an explicit, audited step before publish; colleague reviews stay
available and are recorded; the audited emergency publish and the privileged-MFA
requirement for anyone who can approve or publish are unchanged. This supersedes
decision 1's "different person" rule only. Recorded on 2026-10-23 as an owner
decision and confirmed here for the split landing PR (part 1 of the GMS/GAA work).
