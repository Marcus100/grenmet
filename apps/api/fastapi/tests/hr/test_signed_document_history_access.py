"""Signed evidence remains scoped to the department that filed it."""

import uuid
from datetime import timedelta

import pytest

from src.auth.models import RoleAssignmentScope
from src.exceptions import AppException
from src.hr.signatures.models import SignedDocument
from src.hr.signatures.service import get_document
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


@pytest.mark.parametrize("key", ["hr.document.read.department", "hr.document.manage"])
async def test_transfer_keeps_original_and_revision_in_filing_department(db_async, key):
    old_department = await make_department(db_async)
    new_department = await make_department(db_async)
    subject = await make_user(db_async)
    signer = await make_user(db_async)
    employment = await make_employee(
        db_async, user=subject, department_id=old_department.id
    )
    old_manager = await make_user(db_async)
    new_manager = await make_user(db_async)
    self_only = await make_user(db_async)
    await make_employee(db_async, user=self_only, department_id=old_department.id)
    role, _ = await make_role_with_permission(db_async, key)
    old_assignment = await assign_role(
        db_async,
        user=old_manager,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=old_department.id,
    )
    await assign_role(
        db_async,
        user=new_manager,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=new_department.id,
    )
    await assign_role(db_async, user=self_only, role=role)
    entity_id = uuid.uuid4()
    originals = []
    for revision in (1, 2):
        record = SignedDocument(
            entity_type="leave_request",
            entity_id=entity_id,
            revision=revision,
            supersedes_document_id=originals[0].id if originals else None,
            signer_id=signer.id,
            subject_id=subject.id,
            department_id=old_department.id,
            signer_name=signer.full_name,
            signature_version=uuid.uuid4(),
            signed_at=utc_now(),
            snapshot='{"form":{"reason":"Private historical reason"}}',
            pdf=b"%PDF historical evidence",
            sha256="0" * 64,
        )
        db_async.add(record)
        await db_async.flush()
        originals.append(record)
    await db_async.commit()

    employment.department_id = new_department.id
    await db_async.commit()
    for record in originals:
        assert (await get_document(db_async, old_manager, record.id)).id == record.id
        assert (await get_document(db_async, subject, record.id)).id == record.id
        assert (await get_document(db_async, signer, record.id)).id == record.id
        for denied in (new_manager, self_only):
            with pytest.raises(AppException) as error:
                await get_document(db_async, denied, record.id)
            assert error.value.status_code == 403

    # The original department grant must still be active for every revision.
    old_assignment.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    for record in originals:
        with pytest.raises(AppException) as error:
            await get_document(db_async, old_manager, record.id)
        assert error.value.status_code == 403
