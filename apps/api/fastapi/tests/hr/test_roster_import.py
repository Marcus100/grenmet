from sqlmodel import Session, select

from src.auth.models import Permission, Role
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department
from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.roster.schemas import RosterCsvValidationRequest
from src.hr.roster.service import validate_roster_csv
from tests.utils.utils import random_email, random_lower_string


def test_roster_csv_validation_detects_invalid_shift(db: Session) -> None:
    user = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"csv_{random_lower_string()}",
            password="password123",
            first_name="CSV",
            last_name="User",
        ),
    )
    role = Role(name=f"ROSTER_ADMIN_{random_lower_string().upper()}")
    permission = Permission(
        key=f"roster.import.{random_lower_string()}",
        action="create",
        entity="roster_import",
        access="department",
        description="Import roster",
    )
    role.permissions.append(permission)
    compatible_permission = Permission(
        key="roster.import",
        action="create",
        entity="roster_import",
        access="department",
        description="Import roster canonical",
    )
    role.permissions.append(compatible_permission)
    user.roles.append(role)
    if not db.get(Department, "dept_csv"):
        db.add(Department(id="dept_csv", name="Dept CSV"))
    if not db.exec(select(ShiftCatalog).where(ShiftCatalog.code == "M")).first():
        db.add(
            ShiftCatalog(
                code="M",
                label="Morning",
                category=ShiftCategory.WORK,
                start_time="06:00",
                end_time="14:00",
            )
        )
    db.add(role)
    db.add(permission)
    db.add(compatible_permission)
    db.add(user)
    db.commit()

    response = validate_roster_csv(
        session=db,
        current_user=user,
        payload=RosterCsvValidationRequest(
            department_id="dept_csv",
            csv_text=f"user_id,assignment_date,shift_code\n{user.id},2026-03-01,Z",
            file_name="bad.csv",
        ),
    )
    assert response.invalid_rows == 1
