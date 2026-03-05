from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.auth.models import Role
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.config import settings
from src.hr.models import Department, EmploymentRecord
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def test_read_hr_profile_me(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/hr/profile/me",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["identity"]["email"] is not None
    assert "profile" in payload
    assert "address" in payload
    assert "employment" in payload


def test_update_hr_profile_me(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.patch(
        f"{settings.API_V1_STR}/hr/profile/me",
        headers=normal_user_token_headers,
        json={
            "profile": {
                "first_name": "Updated",
                "last_name": "Person",
                "display_name": "Updated Person",
                "nationality": "Grenadian",
            },
            "address": {
                "line_1": "Point Salines",
                "city": "St. George's",
                "country": "Grenada",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["first_name"] == "Updated"
    assert payload["profile"]["display_name"] == "Updated Person"
    assert payload["address"]["city"] == "St. George's"


def test_supervisor_cannot_update_other_department(
    client: TestClient, db: Session
) -> None:
    supervisor = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"sup_{random_lower_string()}",
            password="password123",
            first_name="Dept",
            last_name="Supervisor",
        ),
    )
    target_user = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"emp_{random_lower_string()}",
            password="password123",
            first_name="Dept",
            last_name="Employee",
        ),
    )

    role = db.exec(select(Role).where(Role.name == "SUPERVISOR")).first()
    if not role:
        role = Role(name="SUPERVISOR")
        db.add(role)
        db.commit()
        db.refresh(role)

    db.refresh(supervisor)
    if role.id not in {assigned_role.id for assigned_role in supervisor.roles}:
        supervisor.roles.append(role)
        db.add(supervisor)

    if not db.get(Department, "dept_one"):
        db.add(Department(id="dept_one", name="Dept One"))
    if not db.get(Department, "dept_two"):
        db.add(Department(id="dept_two", name="Dept Two"))
    db.commit()

    supervisor_employment = EmploymentRecord(
        user_id=supervisor.id,
        employee_number=f"SUP-{random_lower_string()}",
        department_id="dept_one",
        position="Supervisor",
    )
    target_employment = EmploymentRecord(
        user_id=target_user.id,
        employee_number=f"EMP-{random_lower_string()}",
        department_id="dept_two",
        position="Officer",
    )
    db.add(supervisor_employment)
    db.add(target_employment)
    db.commit()

    headers = user_authentication_headers(
        client=client, email=supervisor.email, password="password123"
    )
    response = client.patch(
        f"{settings.API_V1_STR}/hr/employment/{target_user.id}",
        headers=headers,
        json={
            "employment": {"position": "Senior Officer"},
        },
    )

    assert response.status_code == 403
