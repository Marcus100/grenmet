import uuid
from datetime import date
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from src.models import BaseModel, UtcDateTime


class TrainingRecordInput(BaseModel):
    organisation_id: str = Field(min_length=1, max_length=100)
    user_id: uuid.UUID
    course_name: str = Field(min_length=1, max_length=200)
    provider: str = Field(min_length=1, max_length=200)
    completed_on: date
    result: Literal["completed", "attended", "failed"]
    expires_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("course_name", "provider")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @model_validator(mode="after")
    def dates(self) -> Self:
        if self.expires_on and (
            self.result != "completed" or self.expires_on < self.completed_on
        ):
            raise ValueError("Expiry must be on or after successful completion")
        return self


class TrainingArchiveInput(BaseModel):
    reason: str = Field(min_length=5, max_length=500)

    @field_validator("reason")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 5:
            raise ValueError("Give a reason of at least five characters")
        return value


class TrainingRecordPublic(TrainingRecordInput):
    id: uuid.UUID
    department_id: str
    created_by: uuid.UUID
    created_at: UtcDateTime
    archived_at: UtcDateTime | None = None
    archive_reason: str | None = None
    can_manage: bool = False


class TrainingRecordList(BaseModel):
    data: list[TrainingRecordPublic]
    count: int
    page: int
    size: int
    can_create: bool


class TrainingEmployeePublic(BaseModel):
    user_id: uuid.UUID
    name: str
    department_id: str
    can_create: bool


class TrainingEmployeeList(BaseModel):
    data: list[TrainingEmployeePublic]
    count: int
    page: int
    size: int
