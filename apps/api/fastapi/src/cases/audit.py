"""Case engine change history, under the organisation's history subject.

Readable by the organisation's admins and owners and by platform superusers
(``src/organisations/audit.py``). This slice holds no confidential reporter data;
when confidential cases arrive (ADR-0069 decision 9) their text is to be marked
sensitive here.
"""

from src.audit import registry

from .models import Case, CaseAction, CaseRiskAssessment, CaseRiskGrid

SUBJECT = "platform_organisation"


def register() -> None:
    for model, record_type, label in (
        (Case, "case", "Case"),
        (CaseRiskAssessment, "case_risk_assessment", "Case risk assessment"),
        (CaseAction, "case_action", "Corrective action"),
    ):
        registry.track(
            model,
            record_type=record_type,
            entity_type=SUBJECT,
            entity_id_attr="organisation_id",
            label=label,
        )
    registry.track(
        CaseRiskGrid,
        record_type="case_risk_grid",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Risk grid",
    )
