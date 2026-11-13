"""Rename indexes to the naming convention models use (#1298).

Older migrations named single-column indexes ``ix_<schema>_<table>_<column>`` or
``<table>_<column>_idx``; ``src.orm`` names them ``<schema>_<table>_<column>_idx``.
Until this migration, ``alembic check`` reported each one as a drop plus a create.
Renaming is a catalog change only: no index is rebuilt and no data moves. It
also creates the one index a model declares that no migration made
(``hr.workflow_step_template.required_user_id``).

Three HR roster JSON columns the models declare as required were nullable in
the database; empty rows are filled with ``{}`` or ``[]`` and the columns made
``NOT NULL`` (small tables; the application always writes them).

Each rename checks both names first: an index that already has its new name is
skipped, and a database where neither or both names exist stops the migration
(it differs from the history this was written against; look before going on).
Everything except the concurrent index build runs in the migration's one
transaction; the build runs last, in autocommit, and a broken (invalid) index
left by an earlier failed attempt is dropped and rebuilt. Downgrade restores
the old names, drops the added index and makes the columns nullable again.

Revision ID: indexnames20261113
Revises: terminalpunch20261112
"""

import sqlalchemy as sa

from alembic import op

revision = "indexnames20261113"
down_revision = "terminalpunch20261112"
branch_labels = None
depends_on = None

# (schema, old name, new name)
RENAMES: tuple[tuple[str, str, str], ...] = (
    ("bookings", "booking_customer_id_idx", "bookings_booking_customer_id_idx"),
    (
        "bookings",
        "booking_event_booking_id_idx",
        "bookings_booking_event_booking_id_idx",
    ),
    ("bookings", "customer_contact_id_idx", "bookings_customer_contact_id_idx"),
    (
        "bookings",
        "customer_organisation_id_idx",
        "bookings_customer_organisation_id_idx",
    ),
    (
        "bookings",
        "provider_organisation_id_idx",
        "bookings_provider_organisation_id_idx",
    ),
    ("bookings", "service_organisation_id_idx", "bookings_service_organisation_id_idx"),
    (
        "bookings",
        "working_hours_provider_id_idx",
        "bookings_working_hours_provider_id_idx",
    ),
    ("cap", "ix_cap_alert_created_by_user_id", "cap_alert_created_by_user_id_idx"),
    ("cap", "ix_cap_alert_identifier", "cap_alert_identifier_idx"),
    ("cap", "ix_cap_alert_lifecycle_state", "cap_alert_lifecycle_state_idx"),
    ("cap", "ix_cap_alert_sender", "cap_alert_sender_idx"),
    ("cap", "ix_cap_alert_sent", "cap_alert_sent_idx"),
    ("cap", "ix_cap_area_info_id", "cap_area_info_id_idx"),
    ("cap", "ix_cap_audit_event_action", "cap_audit_event_action_idx"),
    ("cap", "ix_cap_audit_event_created_at", "cap_audit_event_created_at_idx"),
    ("cap", "ix_cap_hazard_profile_key", "cap_hazard_profile_key_idx"),
    ("cap", "ix_cap_incident_alert_id", "cap_incident_alert_id_idx"),
    ("cap", "ix_cap_info_alert_id", "cap_info_alert_id_idx"),
    ("cap", "ix_cap_info_expires", "cap_info_expires_idx"),
    ("cap", "ix_cap_job_event_status", "cap_job_event_status_idx"),
    ("cap", "ix_cap_reference_alert_id", "cap_reference_alert_id_idx"),
    ("cap", "ix_cap_resource_info_id", "cap_resource_info_id_idx"),
    ("cap", "ix_cap_snapshot_alert_id", "cap_snapshot_alert_id_idx"),
    ("cap", "ix_cap_snapshot_content_hash", "cap_snapshot_content_hash_idx"),
    ("cap", "ix_cap_snapshot_generated_at", "cap_snapshot_generated_at_idx"),
    ("cap", "ix_cap_snapshot_identifier", "cap_snapshot_identifier_idx"),
    (
        "hr",
        "ix_hr_absentee_report_department_id",
        "hr_absentee_report_department_id_idx",
    ),
    ("hr", "ix_hr_absentee_report_user_id", "hr_absentee_report_user_id_idx"),
    (
        "hr",
        "ix_hr_approval_action_log_actor_user_id",
        "hr_approval_action_log_actor_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_approval_action_log_workflow_instance_id",
        "hr_approval_action_log_workflow_instance_id_idx",
    ),
    (
        "hr",
        "ix_hr_approval_action_log_workflow_step_instance_id",
        "hr_approval_action_log_workflow_step_instance_id_idx",
    ),
    ("hr", "ix_hr_approval_authority_user_id", "hr_approval_authority_user_id_idx"),
    (
        "hr",
        "ix_hr_calendar_event_created_by_user_id",
        "hr_calendar_event_created_by_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_clock_punch_roster_assignment_id",
        "hr_clock_punch_roster_assignment_id_idx",
    ),
    ("hr", "ix_hr_clock_punch_user_id", "hr_clock_punch_user_id_idx"),
    ("hr", "ix_hr_clock_site_department_id", "hr_clock_site_department_id_idx"),
    ("hr", "ix_hr_clock_site_token_hash", "hr_clock_site_token_hash_idx"),
    ("hr", "ix_hr_department_organisation_id", "hr_department_organisation_id_idx"),
    (
        "hr",
        "ix_hr_department_policy_department_id",
        "hr_department_policy_department_id_idx",
    ),
    (
        "hr",
        "ix_hr_employee_document_organisation_id",
        "hr_employee_document_organisation_id_idx",
    ),
    (
        "hr",
        "ix_hr_employment_record_employee_number",
        "hr_employment_record_employee_number_idx",
    ),
    (
        "hr",
        "ix_hr_employment_record_organisation_id",
        "hr_employment_record_organisation_id_idx",
    ),
    ("hr", "ix_hr_employment_record_user_id", "hr_employment_record_user_id_idx"),
    ("hr", "ix_hr_grade_department_id", "hr_grade_department_id_idx"),
    ("hr", "ix_hr_leave_balance_event_user_id", "hr_leave_balance_event_user_id_idx"),
    ("hr", "ix_hr_leave_balance_user_id", "hr_leave_balance_user_id_idx"),
    ("hr", "ix_hr_leave_carry_over_user_id", "hr_leave_carry_over_user_id_idx"),
    ("hr", "ix_hr_leave_request_department_id", "hr_leave_request_department_id_idx"),
    ("hr", "ix_hr_leave_request_user_id", "hr_leave_request_user_id_idx"),
    ("hr", "ix_hr_public_holiday_holiday_date", "hr_public_holiday_holiday_date_idx"),
    (
        "hr",
        "ix_hr_roster_assignment_assignment_date",
        "hr_roster_assignment_assignment_date_idx",
    ),
    (
        "hr",
        "ix_hr_roster_assignment_roster_period_id",
        "hr_roster_assignment_roster_period_id_idx",
    ),
    ("hr", "ix_hr_roster_assignment_user_id", "hr_roster_assignment_user_id_idx"),
    (
        "hr",
        "ix_hr_roster_import_job_created_by_user_id",
        "hr_roster_import_job_created_by_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_roster_import_job_department_id",
        "hr_roster_import_job_department_id_idx",
    ),
    (
        "hr",
        "ix_hr_roster_import_row_roster_import_job_id",
        "hr_roster_import_row_roster_import_job_id_idx",
    ),
    (
        "hr",
        "ix_hr_roster_period_created_by_user_id",
        "hr_roster_period_created_by_user_id_idx",
    ),
    ("hr", "ix_hr_roster_period_department_id", "hr_roster_period_department_id_idx"),
    ("hr", "ix_hr_roster_preference_user_id", "hr_roster_preference_user_id_idx"),
    (
        "hr",
        "ix_hr_roster_preferred_shift_user_id",
        "hr_roster_preferred_shift_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_roster_restricted_shift_user_id",
        "hr_roster_restricted_shift_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_roster_revision_roster_period_id",
        "hr_roster_revision_roster_period_id_idx",
    ),
    (
        "hr",
        "ix_hr_shift_swap_request_counterpart_user_id",
        "hr_shift_swap_request_counterpart_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_shift_swap_request_department_id",
        "hr_shift_swap_request_department_id_idx",
    ),
    (
        "hr",
        "ix_hr_shift_swap_request_requesting_user_id",
        "hr_shift_swap_request_requesting_user_id_idx",
    ),
    ("hr", "ix_hr_signed_document_entity_id", "hr_signed_document_entity_id_idx"),
    ("hr", "ix_hr_signed_document_signer_id", "hr_signed_document_signer_id_idx"),
    ("hr", "ix_hr_status_report_department_id", "hr_status_report_department_id_idx"),
    (
        "hr",
        "ix_hr_status_report_entry_status_report_id",
        "hr_status_report_entry_status_report_id_idx",
    ),
    ("hr", "ix_hr_status_report_entry_user_id", "hr_status_report_entry_user_id_idx"),
    (
        "hr",
        "ix_hr_status_report_submitted_by_user_id",
        "hr_status_report_submitted_by_user_id_idx",
    ),
    ("hr", "ix_hr_timesheet_department_id", "hr_timesheet_department_id_idx"),
    ("hr", "ix_hr_timesheet_entry_timesheet_id", "hr_timesheet_entry_timesheet_id_idx"),
    (
        "hr",
        "ix_hr_timesheet_submission_submitted_by_user_id",
        "hr_timesheet_submission_submitted_by_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_timesheet_submission_timesheet_id",
        "hr_timesheet_submission_timesheet_id_idx",
    ),
    ("hr", "ix_hr_timesheet_user_id", "hr_timesheet_user_id_idx"),
    (
        "hr",
        "ix_hr_training_record_organisation_id",
        "hr_training_record_organisation_id_idx",
    ),
    ("hr", "ix_hr_training_record_user_id", "hr_training_record_user_id_idx"),
    ("hr", "ix_hr_user_address_user_id", "hr_user_address_user_id_idx"),
    ("hr", "ix_hr_user_profile_user_id", "hr_user_profile_user_id_idx"),
    (
        "hr",
        "ix_hr_workflow_instance_department_id",
        "hr_workflow_instance_department_id_idx",
    ),
    ("hr", "ix_hr_workflow_instance_entity_id", "hr_workflow_instance_entity_id_idx"),
    (
        "hr",
        "ix_hr_workflow_instance_requested_by_user_id",
        "hr_workflow_instance_requested_by_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_instance_workflow_template_id",
        "hr_workflow_instance_workflow_template_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_step_instance_approver_user_id",
        "hr_workflow_step_instance_approver_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_step_instance_required_role_id",
        "hr_workflow_step_instance_required_role_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_step_instance_required_user_id",
        "hr_workflow_step_instance_required_user_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_step_instance_workflow_instance_id",
        "hr_workflow_step_instance_workflow_instance_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_step_template_required_role_id",
        "hr_workflow_step_template_required_role_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_step_template_workflow_template_id",
        "hr_workflow_step_template_workflow_template_id_idx",
    ),
    (
        "hr",
        "ix_hr_workflow_template_department_id",
        "hr_workflow_template_department_id_idx",
    ),
    ("org", "contact_consent_contact_id_idx", "org_contact_consent_contact_id_idx"),
    (
        "org",
        "contact_consent_organisation_id_idx",
        "org_contact_consent_organisation_id_idx",
    ),
    ("org", "contact_organisation_id_idx", "org_contact_organisation_id_idx"),
    ("org", "contact_user_id_idx", "org_contact_user_id_idx"),
    ("org", "membership_user_id_idx", "org_membership_user_id_idx"),
    ("public", "ix_external_identity_user_id", "external_identity_user_id_idx"),
    (
        "public",
        "ix_notification_occurrence_notification_id",
        "notification_occurrence_notification_id_idx",
    ),
    ("public", "ix_permission_key", "permission_key_idx"),
    ("public", "ix_session_app_name", "session_app_name_idx"),
    ("public", "ix_user_email", "user_email_idx"),
    ("public", "ix_user_phone_e164", "user_phone_e164_idx"),
    (
        "public",
        "ix_user_role_assignment_authority_assignment_id",
        "user_role_assignment_authority_assignment_id_idx",
    ),
    (
        "public",
        "ix_user_role_assignment_organisation_id",
        "user_role_assignment_organisation_id_idx",
    ),
    ("public", "ix_user_role_assignment_role_id", "user_role_assignment_role_id_idx"),
    ("public", "ix_user_role_assignment_user_id", "user_role_assignment_user_id_idx"),
    ("public", "ix_user_username", "user_username_idx"),
    ("stores", "ix_stores_item_organisation_id", "stores_item_organisation_id_idx"),
    (
        "stores",
        "ix_stores_requisition_department_id",
        "stores_requisition_department_id_idx",
    ),
    (
        "stores",
        "ix_stores_requisition_line_requisition_id",
        "stores_requisition_line_requisition_id_idx",
    ),
    (
        "stores",
        "ix_stores_requisition_organisation_id",
        "stores_requisition_organisation_id_idx",
    ),
    (
        "stores",
        "ix_stores_requisition_requester_user_id",
        "stores_requisition_requester_user_id_idx",
    ),
    (
        "stores",
        "ix_stores_stock_movement_location_id",
        "stores_stock_movement_location_id_idx",
    ),
    (
        "stores",
        "ix_stores_stock_movement_organisation_id",
        "stores_stock_movement_organisation_id_idx",
    ),
    (
        "stores",
        "ix_stores_stock_movement_requisition_id",
        "stores_stock_movement_requisition_id_idx",
    ),
    (
        "stores",
        "ix_stores_store_location_organisation_id",
        "stores_store_location_organisation_id_idx",
    ),
)

MISSING_INDEX = "hr_workflow_step_template_required_user_id_idx"

# (table in hr, column, fill value for empty rows)
REQUIRED_JSON: tuple[tuple[str, str, str], ...] = (
    ("roster_import_row", "raw_data", "{}"),
    ("roster_import_row", "validation_errors", "[]"),
    ("roster_revision", "snapshot", "{}"),
)


def _exists(schema: str, name: str) -> bool:
    found = op.get_bind().scalar(
        sa.text("SELECT to_regclass(:name)"), {"name": f'"{schema}"."{name}"'}
    )
    return found is not None


def _rename(schema: str, old: str, new: str) -> None:
    has_old, has_new = _exists(schema, old), _exists(schema, new)
    if has_new and not has_old:
        return
    if has_old == has_new:
        state = "both" if has_old else "neither"
        raise RuntimeError(
            f"index rename {schema}.{old} -> {new}: {state} names exist; "
            "this database differs from the migration history (#1298)"
        )
    # migration-safety: a catalog-only rename; no code names these indexes.
    op.execute(f'ALTER INDEX "{schema}"."{old}" RENAME TO "{new}"')


def _index_is_valid() -> bool | None:
    """True or False for the added index, None when it does not exist."""
    return op.get_bind().scalar(
        sa.text(
            "SELECT i.indisvalid FROM pg_index i "
            "WHERE i.indexrelid = to_regclass(:name)"
        ),
        {"name": f'hr."{MISSING_INDEX}"'},
    )


def upgrade() -> None:
    for schema, old, new in RENAMES:
        _rename(schema, old, new)
    for table, column, empty in REQUIRED_JSON:
        check = f"{table}_{column}_not_null"
        op.execute(
            f"UPDATE hr.{table} SET {column} = '{empty}'::json WHERE {column} IS NULL"
        )
        op.execute(
            f"ALTER TABLE hr.{table} ADD CONSTRAINT {check} "
            f"CHECK ({column} IS NOT NULL) NOT VALID"
        )
        op.execute(f"ALTER TABLE hr.{table} VALIDATE CONSTRAINT {check}")
        # migration-safety: the validated check lets Postgres skip the table scan.
        op.execute(f"ALTER TABLE hr.{table} ALTER COLUMN {column} SET NOT NULL")
        # migration-safety: drops only the temporary check added just above.
        op.execute(f"ALTER TABLE hr.{table} DROP CONSTRAINT {check}")
    # Last: CONCURRENTLY cannot run in a transaction, and the commit before it
    # ends the migration lock, so nothing else follows it.
    with op.get_context().autocommit_block():
        if _index_is_valid() is False:
            op.execute(f'DROP INDEX CONCURRENTLY IF EXISTS hr."{MISSING_INDEX}"')
        op.execute(
            f'CREATE INDEX CONCURRENTLY IF NOT EXISTS "{MISSING_INDEX}" '
            "ON hr.workflow_step_template (required_user_id)"
        )
        if _index_is_valid() is not True:
            raise RuntimeError(f"index hr.{MISSING_INDEX} was not built; run again")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f'DROP INDEX CONCURRENTLY IF EXISTS hr."{MISSING_INDEX}"')
    for table, column, _ in REQUIRED_JSON:
        op.alter_column(table, column, schema="hr", nullable=True)
    for schema, old, new in RENAMES:
        _rename(schema, new, old)
