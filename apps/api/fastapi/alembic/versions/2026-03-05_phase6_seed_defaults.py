"""phase 6 seed defaults and compatibility

Revision ID: c106eec1aa06
Revises: c105eec1aa05
Create Date: 2026-03-05 18:25:00.000000
"""

from alembic import op


revision = "c106eec1aa06"
down_revision = "c105eec1aa05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permission (id, key, action, entity, access, description)
        VALUES
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e0a10', 'roster.view', 'read', 'roster', 'department', 'View roster data'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e0a11', 'roster.manage', 'update', 'roster', 'department', 'Manage roster periods and assignments'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e0a12', 'roster.import', 'create', 'roster_import', 'department', 'Import roster CSV'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e0a13', 'timesheet.submit', 'create', 'timesheet', 'self', 'Submit timesheets'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e0a14', 'timesheet.approve', 'update', 'timesheet', 'department', 'Approve department timesheets')
        ON CONFLICT (key) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO hr.department_policy
          (id, department_id, allow_employee_self_submit, allow_supervisor_proxy_submit, created_at, updated_at)
        VALUES
          ('6a87f5c1-73f4-44bd-ad43-8af10e0e0b10', 'dept_met', true, true, NOW(), NOW())
        ON CONFLICT (department_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO hr.workflow_template
          (id, department_id, workflow_type, name, is_active, created_by, created_at, updated_at)
        VALUES
          ('6a87f5c1-73f4-44bd-ad43-8af10e0e0c10', 'dept_met', 'LEAVE_REQUEST', 'Met Service Leave Approval', true, NULL, NOW(), NOW()),
          ('6a87f5c1-73f4-44bd-ad43-8af10e0e0c11', 'dept_met', 'SHIFT_SWAP', 'Met Service Shift Swap Approval', true, NULL, NOW(), NOW()),
          ('6a87f5c1-73f4-44bd-ad43-8af10e0e0c12', 'dept_met', 'ABSENTEE_REPORT', 'Met Service Absentee Approval', true, NULL, NOW(), NOW()),
          ('6a87f5c1-73f4-44bd-ad43-8af10e0e0c13', 'dept_met', 'STATUS_REPORT', 'Met Service Status Report Approval', true, NULL, NOW(), NOW()),
          ('6a87f5c1-73f4-44bd-ad43-8af10e0e0c14', 'dept_met', 'TIMESHEET', 'Met Service Timesheet Approval', true, NULL, NOW(), NOW())
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM hr.workflow_template
        WHERE department_id = 'dept_met'
          AND workflow_type IN ('LEAVE_REQUEST', 'SHIFT_SWAP', 'ABSENTEE_REPORT', 'STATUS_REPORT', 'TIMESHEET')
        """
    )
    op.execute(
        "DELETE FROM hr.department_policy WHERE department_id = 'dept_met'"
    )
    op.execute(
        """
        DELETE FROM permission
        WHERE key IN (
            'roster.view',
            'roster.manage',
            'roster.import',
            'timesheet.submit',
            'timesheet.approve'
        )
        """
    )
