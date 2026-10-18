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
