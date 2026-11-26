"""Operations log domain (ADR-0067). Notes for anyone changing it.

**Owner:** Barrels Grenada. First module of the airport operations programme
(`docs/products/airport-operations-programme.md`); architecture ADR-0067. Organisation
scoped: the airport authority is one organisation like any other.

- **Tables** in the `opslog` schema of the main database (migration
  `2026-11-25_opslog.py`, revision `opslog20261125`): `log`, `category` (three levels,
  `depth` 1 to 3), `entry`, `entry_comment` (insert only). Models are `OpsLog*` classes.
  Ids are prefixed strings (`olg_`, `olc_`, `ole_`, `olm_`). `author_id` is an auth user
  id with no foreign key.
- **Routes** (`router.py`, zone `org`, ADR-0025): every route uses
  `require_org_permission` with one `opslog.*` key; no superuser bypass. Every lookup
  filters on the organisation in SQL. Private entries are 404 without
  `opslog.entries.private`, never 403, so their existence is not revealed.
- **Edit rules** (`service.update_entry`): only manual entries, only in an `open` log,
  only by the author, only inside `edit_window_minutes` when set. `append_only` allows
  comments; `locked` allows neither. Archived logs refuse every write. The edit window
  counts from `created_at` and does not restart after an edit. Sending `null` for
  `text` or `occurred_at` is 422.
- **History** (`audit.py`): logs, categories, entries and comments are tracked under
  `platform_organisation`. Entry text is deliberately not excluded: an edited entry
  must keep its earlier text on record. Platform superusers can read organisation
  history, private entry text included (platform support access).
- **Automatic entries** (`outbox_handlers.py`, topic `opslog.entry_post`, payload in
  `messages.py`): other modules never import opslog; they enqueue the message and
  reference their record as `(kind, id)`. The handler skips a message whose entry
  exists (`entry.outbox_message_id` is unique), drops a message for an organisation
  without the entitlement, without a receiving log, or naming a log archived since,
  and dead-letters
  (`TerminalFailure`) a bad payload or a `log_id` that is not the organisation's.
- **Photos** (`attachments.py`, purpose `opslog-photo`) hold an upload id only; an
  entry's `record` gets its title from `src/record_links.py` when the viewer may see it.
- **Not built yet** (issue #1875): category notifications, the daily
  summary email, structured logs and the shift handover report.

Keyword search (`q`) is an unindexed `ILIKE` within one log; fine at airport volumes,
add a trigram index if a log grows large.

## Tests

`tests/opslog/`: rules, filters and keyset paging, private entries, cross-organisation
and superuser refusal, entitlement, audit of the earlier text, and the outbox handler.
"""
