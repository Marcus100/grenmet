"""Incidents domain (ADR-0067, issue #1876). Notes for anyone changing it.

One record per significant occurrence, from first report to manager review.
Organisation scoped: entitlement ``incidents``, routes in the ``org`` zone only,
each behind one ``incidents.*`` organisation key; no superuser bypass; every
lookup filters on the organisation in SQL.

- Tables in the ``incidents`` schema (migration ``2026-11-25_incidents.py``,
  revision ``incidents20261125``): ``category``, ``checklist_item``, ``counter``,
  ``incident``, ``incident_check``, ``timeline_entry``, ``note``.
- Lifecycle: draft, open, closed. ``open`` copies the category's active checklist
  into ``incident_check`` (template edits never rewrite a past response). The
  category is fixed once open. ``close`` needs ``incidents.incidents.manage`` and
  every required check done; closing locks the record (every write is 409).
  ``reopen`` needs the same key and a reason, recorded on the timeline.
- The timeline (response actions) and notes are insert only. Private notes need
  ``incidents.incidents.private`` to write and to see.
- Opening, closing and reopening enqueue ``opslog.entry_post`` (dedupe key
  ``incidents.timeline:<timeline id>``, record ``("incidents.incident", id)``).
  This module never imports opslog (ADR-0067 decision 3).
- References are ``INC-<year>-<nnnn>`` per organisation, issued by one upsert on
  ``counter``.
- History (``audit.py``) tracks every table under ``platform_organisation``.
- Not built yet (later slices of #1876): persons involved and witnesses, damage
  and resources, weather at the time, attachments, notifications to the category
  manager, links to work orders and cases, the public report form.
"""
