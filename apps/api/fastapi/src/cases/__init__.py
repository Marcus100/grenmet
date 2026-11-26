"""Case engine (ADR-0069, issue #1877). Notes for anyone changing it.

One engine for several programmes; only ``safety`` is built. Each programme is its
own product (``entitlements.PRODUCTS``) with its own organisation keys, and is a
path segment: ``/cases/org/{programme}/...`` (kebab-case). ``dependencies.py``
resolves the programme, then checks membership, the programme's entitlement and
the key ``<programme>.<suffix>``. A programme that is not a product is 404. No
superuser bypass.

- Tables in the ``cases`` schema (migration ``2026-11-26_cases.py``): ``risk_grid``,
  ``counter``, ``case``, ``risk_assessment``, ``action``. Every table carries
  ``organisation_id`` and ``programme``; children point at their case with a
  composite key on all three. ``programme`` is text with a check.
- Risk (``risk.py``): the default grid is the ICAO Doc 9859 example (5 by 5, index
  such as ``4B``); an organisation may set its own levels and bands. A band's
  meaning is fixed: acceptable, tolerable, intolerable. An assessment copies the
  labels and band it was made with and is never changed.
- Acceptance: only the latest residual assessment, only when tolerable, only with
  ``<programme>.cases.approve``, and never by the person who assessed it. Intolerable is never accepted (also a database
  check).
- Closing (``service._check_may_close``): every action verified, and the latest
  residual risk acceptable, or tolerable and accepted; or ``no_risk`` with a
  reason, refused once any risk above acceptable was assessed. After a reopening
  (``reopened_at``) the residual risk must be assessed again. Closing and reopening need the approve key; closed cases are locked.
- Status moves go through ``transitions.py`` (case and action tables).
- Corrective actions: an owner (active member), a due date, open to done to
  verified; verified by an approver who is not the owner; the owner is notified
  (``cases.action_assigned``).
- A case may name the record it came from (``source``, ``(kind, id)``); the
  reporter must be able to see it (``src/record_links.py``). ``cases.case`` is
  registered for other domains.
- Not built yet: the investigation, confidential cases and reporter protection
  (grant-only confidential keys, ADR-0069 decisions 2 and 9), overdue reminders,
  the hazard register, indicators, audits, the other three programmes, operations
  log posts.
"""
