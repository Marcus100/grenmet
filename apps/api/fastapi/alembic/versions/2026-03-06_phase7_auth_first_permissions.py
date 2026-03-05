"""phase 7 auth first permission keys

Revision ID: c107eec1aa07
Revises: c106eec1aa06
Create Date: 2026-03-06 09:00:00.000000
"""

from alembic import op


revision = "c107eec1aa07"
down_revision = "c106eec1aa06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE permission
        SET key = LOWER(entity || '.' || action)
        WHERE key IS NULL OR key = ''
        """
    )
    op.execute(
        """
        INSERT INTO permission (id, key, action, entity, access, description)
        VALUES
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a20', 'hr.employment.manage', 'update', 'hr_employment', 'department', 'Manage employment records'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a21', 'workflow.template.manage', 'update', 'workflow_template', 'department', 'Manage workflow templates'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a22', 'workflow.template.view', 'read', 'workflow_template', 'department', 'View workflow templates'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a23', 'workflow.instance.view', 'read', 'workflow_instance', 'department', 'View workflow instances'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a24', 'workflow.instance.action', 'update', 'workflow_instance', 'department', 'Action workflow instances'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a25', 'timesheet.submit.self', 'create', 'timesheet', 'self', 'Submit own timesheet'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a26', 'timesheet.submit.proxy', 'create', 'timesheet', 'department', 'Submit timesheet for department member'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a27', 'timesheet.read.department', 'read', 'timesheet', 'department', 'Read department timesheets'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a28', 'leave.request.create.self', 'create', 'leave_request', 'self', 'Create own leave request'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a29', 'leave.request.action', 'update', 'leave_request', 'department', 'Action leave requests'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a30', 'shift_swap.request.create.self', 'create', 'shift_swap', 'self', 'Create own shift swap request'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a31', 'shift_swap.request.action', 'update', 'shift_swap', 'department', 'Action shift swap requests'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a32', 'absentee.report.create', 'create', 'absentee_report', 'department', 'Create absentee report'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a33', 'absentee.report.read.department', 'read', 'absentee_report', 'department', 'Read department absentee reports'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a34', 'status.report.create', 'create', 'status_report', 'department', 'Create status report'),
            ('6a87f5c1-73f4-44bd-ad43-8af10e0e1a35', 'status.report.read', 'read', 'status_report', 'department', 'Read status reports')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM permission
        WHERE key IN (
            'hr.employment.manage',
            'workflow.template.manage',
            'workflow.template.view',
            'workflow.instance.view',
            'workflow.instance.action',
            'timesheet.submit.self',
            'timesheet.submit.proxy',
            'timesheet.read.department',
            'leave.request.create.self',
            'leave.request.action',
            'shift_swap.request.create.self',
            'shift_swap.request.action',
            'absentee.report.create',
            'absentee.report.read.department',
            'status.report.create',
            'status.report.read'
        )
        """
    )
