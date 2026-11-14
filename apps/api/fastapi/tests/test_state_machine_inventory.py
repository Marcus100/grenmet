"""The inventory of every stored status in the API, and the check that keeps it true.

A status column is a state machine whether or not anyone wrote it down. This file
is where each one is written down: every ``status``-like column of every model is
listed in ``INVENTORY`` with a decision.

    TABLE      a lifecycle with rules. The moves live in one transition table and
               every later write goes through its guard. ``where`` is that module.
    SWITCH     a setting a person turns (active/paused, scheduled/cancelled). Every
               move is allowed, so a table would only repeat the enum.
    OUTCOME    written when the row is made, or as the recorded result of one
               attempt. Nothing moves it afterwards by rule.
    ATTRIBUTE  a description of the thing (a CAP message's ``Actual``/``Test``),
               not a place in a lifecycle.

Adding a model with a status column fails ``test_every_status_column_has_a_decision``
until it has a row here. Assigning a status outside the files in ``STATUS_WRITERS``
fails ``test_status_is_only_assigned_where_the_inventory_says``: write the move in
the domain's ``transitions.py`` (pattern: ``src/stores/transitions.py``, tested
like ``tests/stores/test_requisition_transitions.py``), or add the file here with
the reason it is not a lifecycle.

Lifecycles that have no status column are listed in ``UNSTORED``, so the index is
complete. No database is needed.
"""

import ast
import re
from enum import Enum
from pathlib import Path
from typing import NamedTuple

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
SRC = API_ROOT / "src"

#: Column names that hold a status. A new spelling belongs here.
STATUS_NAMES = frozenset(
    {"status", "state", "lifecycle_state", "verification_status", "rule_state", "stage"}
)


class Kind(str, Enum):
    TABLE = "table"
    SWITCH = "switch"
    OUTCOME = "outcome"
    ATTRIBUTE = "attribute"


class Decision(NamedTuple):
    kind: Kind
    #: TABLE: the module that declares the moves. Otherwise: why there is no table.
    where: str


def _table(module: str) -> Decision:
    return Decision(Kind.TABLE, module)


def _switch(why: str) -> Decision:
    return Decision(Kind.SWITCH, why)


def _outcome(why: str) -> Decision:
    return Decision(Kind.OUTCOME, why)


def _attribute(why: str) -> Decision:
    return Decision(Kind.ATTRIBUTE, why)


_PAYROLL = _table("src/hr/payroll/transitions.py")
_HR_REQUEST = _table("src/hr/workflow/transitions.py")
_EVENTS = _table("src/events/transitions.py")
_PAYMENTS = _table("src/payments/transitions.py")
_CAP_SWITCH = _switch("an integration is active or paused by a CAP administrator")
_DELIVERY = "the recorded result of a delivery attempt; retries are owned by the outbox"

#: ``<models file>:<Model>.<column>`` -> the decision for that column.
INVENTORY: dict[str, Decision] = {
    "src/almanac/models.py:TidePrediction.status": _attribute(
        "the source agency's label for a tide prediction"
    ),
    "src/billing/models.py:Invoice.status": _table("src/billing/transitions.py"),
    "src/billing/models.py:InvoiceReminder.stage": _attribute(
        "which reminder was sent; one row per stage, never updated"
    ),
    "src/bookings/models.py:Booking.status": _table("src/bookings/transitions.py"),
    "src/cap/models.py:CapAlert.status": _attribute(
        "the CAP 1.2 message status (Actual, Exercise, Test), set by the author"
    ),
    "src/cap/models.py:CapAlert.lifecycle_state": _table("src/cap/transitions.py"),
    "src/cap/models.py:CapWebhook.status": _CAP_SWITCH,
    "src/cap/models.py:CapMqttBroker.status": _CAP_SWITCH,
    "src/cap/models.py:CapFeedImport.status": _CAP_SWITCH,
    "src/cap/models.py:CapJobEvent.status": _table("src/worker/dispatch.py"),
    "src/cap/models.py:CapHazardProfile.state": _table("src/cap/transitions.py"),
    "src/content_distribution/models.py:ContentDelivery.status": _outcome(_DELIVERY),
    "src/eregister/models.py:ERegisterSend.status": _outcome(
        "the recorded result of one send of a bulletin; a resend is a new row"
    ),
    "src/events/models.py:GroupMember.status": _EVENTS,
    "src/events/models.py:Listing.status": _EVENTS,
    "src/events/models.py:Connection.status": _EVENTS,
    "src/events/models.py:Report.status": _switch(
        "a moderation label; staff may set any value (enum in events/transitions.py)"
    ),
    "src/events/models.py:Suggestion.status": _switch(
        "a moderation label; staff may set any value (enum in events/transitions.py)"
    ),
    "src/events/models.py:Order.status": _EVENTS,
    "src/events/models.py:Ticket.status": _EVENTS,
    "src/hr/absentee/models.py:AbsenteeReport.status": _HR_REQUEST,
    "src/hr/attendance/models.py:ClockPunch.status": _table(
        "src/hr/attendance/transitions.py"
    ),
    "src/hr/dailystatus/models.py:StatusReport.status": _HR_REQUEST,
    "src/hr/exchange/models.py:ShiftSwapRequest.status": _HR_REQUEST,
    "src/hr/leave/models.py:LeaveRequest.status": _HR_REQUEST,
    "src/hr/models.py:EmploymentRecord.status": _switch(
        "HR sets active, inactive or terminated in any order; "
        "hr/employment_status.py is the one writer and ends the roles with it"
    ),
    "src/hr/parking/models.py:ParkingPermit.status": _HR_REQUEST,
    "src/hr/payroll/models.py:PayCalendar.rule_state": _PAYROLL,
    "src/hr/payroll/models.py:PayPeriod.status": _PAYROLL,
    "src/hr/payroll/models.py:PayItem.rule_state": _PAYROLL,
    "src/hr/payroll/models.py:PayItemRate.rule_state": _PAYROLL,
    "src/hr/payroll/models.py:TaxTable.rule_state": _PAYROLL,
    "src/hr/payroll/models.py:SocialInsuranceScheme.rule_state": _PAYROLL,
    "src/hr/payroll/models.py:DeductionType.rule_state": _PAYROLL,
    "src/hr/roster/models.py:RosterPeriod.status": _table(
        "src/hr/roster/transitions.py"
    ),
    "src/hr/roster/models.py:RosterImportJob.status": _outcome(
        "the result of one import, set when the job row is made"
    ),
    "src/hr/timesheet/models.py:Timesheet.status": _table(
        "src/hr/timesheet/transitions.py"
    ),
    "src/hr/workflow/models.py:WorkflowInstance.status": _HR_REQUEST,
    "src/janitorial/models.py:ShiftAssignment.status": _switch(
        "a shift is scheduled or cancelled by the supervisor, either way round"
    ),
    "src/models_guidance/models.py:GuidanceAccessRequest.status": _table(
        "src/models_guidance/transitions.py"
    ),
    "src/notifications/models.py:NotificationDelivery.status": _outcome(_DELIVERY),
    "src/notifications/models.py:OutboundEmail.status": _outcome(_DELIVERY),
    "src/organisations/models.py:PlatformOrganisation.status": _switch(
        "a platform administrator sets active or suspended, either way round"
    ),
    "src/organisations/models.py:PlatformOrganisation.verification_status": _table(
        "src/organisations/transitions.py"
    ),
    "src/organisations/models.py:Membership.status": _table(
        "src/organisations/transitions.py"
    ),
    "src/outbox.py:Outbox.status": _table("src/outbox.py"),
    "src/payments/models.py:Intent.status": _PAYMENTS,
    "src/payments/models.py:Attempt.status": _PAYMENTS,
    "src/payments/models.py:Refund.status": _PAYMENTS,
    "src/rewards/models.py:Program.status": _switch(
        "a programme is active or paused by the organisation, either way round"
    ),
    "src/rewards/models.py:Entry.status": _table("src/rewards/transitions.py"),
    "src/rewards/models_gamification.py:Trail.status": _attribute(
        "set from the trail form with the rest of its fields"
    ),
    "src/rewards/models_social.py:Challenge.status": _switch(
        "a challenge is active or paused by the organisation, either way round"
    ),
    "src/storage/models.py:OrgUpload.status": _table("src/storage/transitions.py"),
    "src/stores/models.py:Requisition.status": _table("src/stores/transitions.py"),
    "src/subscriptions/models.py:ListSubscription.status": _table(
        "src/subscriptions/transitions.py"
    ),
    "src/transport/models.py:TimetableVersion.status": _table(
        "src/transport/timetable/transitions.py"
    ),
    "src/transport/models.py:TimetableTrip.status": _attribute(
        "whether the operator has confirmed the trip; saved with the trip form"
    ),
    "src/webhooks_out/models.py:WebhookEndpoint.status": _switch(
        "an endpoint is active or disabled, by an admin or after repeated failures"
    ),
    "src/webhooks_out/models.py:WebhookDelivery.status": _table(
        "src/webhooks_out/delivery.py"
    ),
    "src/wxproducts/models.py:TropicalSystem.status": _table(
        "src/wxproducts/transitions.py"
    ),
}

#: Lifecycles with a table but no ORM status column of their own.
UNSTORED: dict[str, str] = {
    "eRegister observation (register_observations.state, written by SQL)": (
        "src/eregister/transitions.py"
    ),
    "wxproducts authored product (derived from draft, revision and publication)": (
        "src/wxproducts/transitions.py"
    ),
}

#: Files that may assign a status attribute, besides the TABLE modules above.
#: Each is either the guard a table names, or the writer of a non-lifecycle status.
STATUS_WRITERS: dict[str, str] = {
    "src/bookings/public.py": "the booking guard: checks bookings/transitions.py first",
    "src/cap/service.py": "_set_lifecycle, the alert guard: checks cap/transitions.py",
    "src/content_distribution/service.py": "delivery outcome (OUTCOME)",
    "src/eregister/cl1_import.py": "an import report object, not a stored row",
    "src/eregister/daily_import.py": "an import report object, not a stored row",
    "src/eregister/publisher.py": "send outcome (OUTCOME)",
    "src/eregister/sends.py": "send outcome (OUTCOME)",
    "src/events/order_refunds.py": "requeues an outbox row it owns",
    "src/events/service/moderation.py": "report and suggestion labels (SWITCH)",
    "src/hr/employment_status.py": "the one writer of employment status (SWITCH)",
    "src/hr/leave/service.py": (
        "legacy leave decision for requests that have no workflow instance; "
        "checked in place, kept until those requests are gone"
    ),
    "src/notifications/dispatch.py": "delivery outcome (OUTCOME)",
    "src/notifications/outbox_handlers.py": "delivery outcome (OUTCOME)",
    "src/organisations/service.py": "organisation status (SWITCH)",
    "src/rewards/service.py": "programme status (SWITCH)",
    "src/rewards/social.py": "challenge status (SWITCH)",
    "src/transport/timetable/service.py": "trip confirmation (ATTRIBUTE)",
    "src/webhooks_out/service.py": "endpoint status (SWITCH)",
    "src/wxproducts/aviation_rules.py": "a parser's position in a message, not stored",
}


#: How the existing modules name a declared table at module level.
_TABLE_NAME = re.compile(
    r"^(?:[A-Z_]*TRANSITIONS|[A-Z_]+_MOVES|[A-Z_]+_NEXT)\b[^=\n]*=", re.MULTILINE
)


def _source_files() -> list[Path]:
    return sorted(path for path in SRC.rglob("*.py") if "migrations" not in path.parts)


def _relative(path: Path) -> str:
    return path.relative_to(API_ROOT).as_posix()


def _status_columns() -> set[str]:
    found: set[str] = set()
    for path in _source_files():
        for node in ast.walk(ast.parse(path.read_text())):
            if not isinstance(node, ast.ClassDef):
                continue
            for item in node.body:
                if (
                    isinstance(item, ast.AnnAssign)
                    and isinstance(item.target, ast.Name)
                    and item.target.id in STATUS_NAMES
                    and "Mapped" in ast.unparse(item.annotation)
                ):
                    found.add(f"{_relative(path)}:{node.name}.{item.target.id}")
    return found


def _files_assigning_status() -> dict[str, list[int]]:
    found: dict[str, list[int]] = {}
    for path in _source_files():
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Assign):
                targets = node.targets
            elif isinstance(node, ast.AugAssign | ast.AnnAssign):
                targets = [node.target]
            else:
                continue
            if any(
                isinstance(target, ast.Attribute) and target.attr in STATUS_NAMES
                for target in targets
            ):
                found.setdefault(_relative(path), []).append(node.lineno)
    return found


def _table_modules() -> set[str]:
    return {d.where for d in INVENTORY.values() if d.kind is Kind.TABLE} | set(
        UNSTORED.values()
    )


def test_every_status_column_has_a_decision() -> None:
    undecided = sorted(_status_columns() - set(INVENTORY))
    assert not undecided, (
        "These status columns are not in INVENTORY. Decide what each one is "
        f"(see this file's docstring) and add a row: {undecided}"
    )


def test_the_inventory_lists_no_column_that_is_gone() -> None:
    stale = sorted(set(INVENTORY) - _status_columns())
    assert not stale, f"Remove these rows; the columns no longer exist: {stale}"


@pytest.mark.parametrize("module", sorted(_table_modules()))
def test_each_table_module_declares_its_moves(module: str) -> None:
    path = API_ROOT / module
    assert path.is_file(), f"{module} is named as a transition table but is missing"
    assert _TABLE_NAME.search(path.read_text()), (
        f"{module} declares no transition table "
        "(TRANSITIONS, <NAME>_TRANSITIONS, <NAME>_MOVES, <NAME>_NEXT or RetryTable)"
    )


def test_every_decision_without_a_table_says_why() -> None:
    for column, decision in INVENTORY.items():
        if decision.kind is not Kind.TABLE:
            assert len(decision.where.split()) >= 4, f"{column}: say why in a sentence"


def test_status_is_only_assigned_where_the_inventory_says() -> None:
    allowed = _table_modules() | set(STATUS_WRITERS)
    stray = {
        file: lines
        for file, lines in _files_assigning_status().items()
        if file not in allowed
    }
    assert not stray, (
        "A status is assigned outside a transition table. Move the write into the "
        "domain's transitions.py guard, or list the file in STATUS_WRITERS with the "
        f"reason it is not a lifecycle: {stray}"
    )


def test_status_writers_lists_no_file_that_stopped_writing() -> None:
    writing = set(_files_assigning_status())
    stale = sorted(set(STATUS_WRITERS) - writing)
    assert not stale, (
        f"Remove these from STATUS_WRITERS; they assign no status: {stale}"
    )
