"""Case engine change history, under the organisation's history subject.

Readable by the organisation's admins and owners and by platform superusers
(``src/organisations/audit.py``). Investigation text is sensitive (masked for readers without
``audit.view_sensitive``). Confidential reporter data (ADR-0069 decision 9) is not
built yet; when it is, its text is marked sensitive here too.
"""

from src.audit import registry

from .models import (
    Case,
    CaseAction,
    CaseInvestigation,
    CaseInvestigationFactor,
    CaseRiskAssessment,
    CaseRiskGrid,
    ContributingFactor,
    FactorSeed,
)

SUBJECT = "platform_organisation"
INVESTIGATION_SENSITIVE = (
    "what_happened",
    "unsafe_acts",
    "unsafe_conditions",
    "why_steps",
    "root_cause",
    "no_investigation_reason",
    "return_reason",
)


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
    registry.track(
        CaseInvestigation,
        record_type="case_investigation",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        sensitive=INVESTIGATION_SENSITIVE,
        label="Case investigation",
    )
    registry.track(
        CaseInvestigationFactor,
        record_type="case_investigation_factor",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Case investigation factor",
    )
    registry.track(
        ContributingFactor,
        record_type="case_contributing_factor",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Contributing factor",
    )
    registry.track(
        FactorSeed,
        record_type="case_factor_seed",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Contributing factor list seed",
    )
