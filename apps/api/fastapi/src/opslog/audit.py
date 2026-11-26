"""Operations log change history, grouped under the organisation's history subject.

Readable by that organisation's admins and owners (the ``platform_organisation``
read check), who hold every opslog key, private entries included. Entry text is
kept on purpose: an edited entry must still show what it said before (ADR-0067
decision 4). Platform superusers may also read organisation history
(``src/organisations/audit.py``), so private entry text is visible to them there
although the opslog routes refuse them; this is the platform's support access,
not an opslog route. Comments are insert-only and tracked so their author and time are
on record.
"""

from src.audit import registry

from .models import OpsLog, OpsLogCategory, OpsLogComment, OpsLogEntry

SUBJECT = "platform_organisation"


def register() -> None:
    registry.track(
        OpsLog,
        record_type="opslog_log",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Operations log",
    )
    registry.track(
        OpsLogCategory,
        record_type="opslog_category",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Operations log category",
    )
    registry.track(
        OpsLogEntry,
        record_type="opslog_entry",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Operations log entry",
    )
    registry.track(
        OpsLogComment,
        record_type="opslog_comment",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Operations log comment",
    )
