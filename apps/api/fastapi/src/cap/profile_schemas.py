import uuid
from typing import Literal

from pydantic import Field, model_validator

from src.cap.models import CapCategory
from src.models import BaseModel, UtcDateTime


class CapProfileRule(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    level: Literal["Advisory", "Watch", "Warning"] = "Warning"
    metric: str = Field(default="", max_length=200)
    operator: Literal[">=", ">", "<=", "<", "observed"] = ">="
    threshold: float | None = Field(default=None, allow_inf_nan=False)
    unit: str = Field(default="", max_length=50)
    duration_minutes: int | None = Field(default=None, ge=1)
    area: str = Field(default="", max_length=1000)
    evidence: str = Field(default="", max_length=2000)


class CapProfileSubtype(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str = Field(min_length=1, max_length=200)
    categories: list[CapCategory] = Field(
        default_factory=lambda: [CapCategory.MET], min_length=1
    )
    rules: list[CapProfileRule] = Field(default_factory=list, max_length=50)
    impacts: list[str] = Field(default_factory=list, max_length=50)
    responses: list[str] = Field(default_factory=list, max_length=50)
    affected_groups: list[str] = Field(default_factory=list, max_length=50)


class CapProfileTemplate(BaseModel):
    level: Literal["Advisory", "Watch", "Warning"]
    headline: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=10000)
    instruction: str = Field(default="", max_length=10000)


class CapProfileDefinition(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    family: str = Field(min_length=1, max_length=200)
    subtypes: list[CapProfileSubtype] = Field(min_length=1, max_length=50)
    templates: list[CapProfileTemplate] = Field(default_factory=list, max_length=3)
    issuing_authority: str = Field(default="", max_length=500)
    reviewing_authority: str = Field(default="", max_length=500)
    contact: str = Field(default="meteorology@gaa.gd; 1-473-444-4142", max_length=500)
    channels: list[
        Literal["CAP feed", "Email / EDIS", "WIS2", "GMS website", "Agency channels"]
    ] = Field(default_factory=list)
    notes: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def unique_choices(self) -> "CapProfileDefinition":
        names = [s.name.strip().casefold() for s in self.subtypes]
        if not all(names) or len(names) != len(set(names)):
            raise ValueError("Subtype names must be nonempty and unique")
        levels = [t.level for t in self.templates]
        if len(levels) != len(set(levels)):
            raise ValueError("Only one template per message level is allowed")
        return self


class CapProfileSave(BaseModel):
    base_version: int = Field(default=0, ge=0)
    definition: CapProfileDefinition


class CapProfilePublic(BaseModel):
    id: uuid.UUID
    key: str
    version: int
    definition: CapProfileDefinition
    state: Literal["DRAFT", "APPROVED"]
    created_by: uuid.UUID
    created_at: UtcDateTime
    approved_by: uuid.UUID | None
    approved_at: UtcDateTime | None
    approval_errors: list[str]


class CapProfileDraftRequest(BaseModel):
    subtype: str
    level: Literal["Advisory", "Watch", "Warning"]
