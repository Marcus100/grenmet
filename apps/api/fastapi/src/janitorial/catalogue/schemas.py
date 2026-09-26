from typing import Annotated, Literal

from pydantic import Field

from src.models import BaseModel

SpaceType = Literal[
    "restroom",
    "office",
    "concourse",
    "lounge",
    "circulation",
    "vertical_transport",
    "boarding",
    "food",
    "storage",
    "technical",
    "exterior",
    "other",
]
BuildingKind = Literal["terminal", "auxiliary", "other"]
PeriodUnit = Literal["minute", "day"]
Name = Annotated[str, Field(min_length=1, max_length=200)]
Note = Annotated[str | None, Field(max_length=4000)]
Revision = Annotated[int, Field(ge=1)]
Level = Annotated[int | None, Field(ge=1, le=5)]
Quantity = Annotated[int, Field(ge=1, le=1000)]


class JanitorialFrequency(BaseModel):
    count: int = Field(ge=1, le=1440)
    periodValue: int = Field(ge=1, le=3650)
    periodUnit: PeriodUnit


class JanitorialTask(BaseModel):
    id: int
    activity: str
    frequency: JanitorialFrequency
    mode: str | None
    active: bool
    revision: int


class JanitorialBundleItem(BaseModel):
    activity: str
    frequency: JanitorialFrequency


class JanitorialBundle(BaseModel):
    id: int
    name: str
    items: list[JanitorialBundleItem]


class JanitorialArea(BaseModel):
    id: int
    code: str
    name: str
    sectionId: int | None
    spaceType: SpaceType
    cleanlinessLevel: int | None
    quantity: int
    active: bool
    revision: int
    tasks: list[JanitorialTask]
    bundles: list[JanitorialBundle]


class JanitorialSection(BaseModel):
    id: int
    name: str
    note: str | None
    active: bool
    revision: int


class JanitorialBuilding(BaseModel):
    id: int
    siteId: int
    code: str
    name: str
    kind: BuildingKind
    active: bool
    revision: int
    sections: list[JanitorialSection]
    areas: list[JanitorialArea]


class JanitorialSite(BaseModel):
    id: int
    code: str
    name: str


class JanitorialCatalogue(BaseModel):
    sites: list[JanitorialSite]
    buildings: list[JanitorialBuilding]


class BuildingCreate(BaseModel):
    siteId: int
    name: Name
    kind: BuildingKind = "other"


class BuildingUpdate(BaseModel):
    name: Name
    kind: BuildingKind
    active: bool
    expectedRevision: Revision


class SectionCreate(BaseModel):
    buildingId: int
    name: Name
    note: Note = None


class SectionUpdate(BaseModel):
    name: Name
    note: Note = None
    active: bool
    expectedRevision: Revision


class AreaCreate(BaseModel):
    buildingId: int
    sectionId: int | None = None
    name: Name
    # Omit to infer from the name.
    spaceType: SpaceType | None = None
    cleanlinessLevel: Level = None
    quantity: Quantity = 1


class AreaUpdate(BaseModel):
    sectionId: int | None
    name: Name
    spaceType: SpaceType
    cleanlinessLevel: Level
    quantity: Quantity
    active: bool
    expectedRevision: Revision


class TaskCreate(BaseModel):
    activity: Name
    frequency: JanitorialFrequency
    mode: str | None = Field(default=None, max_length=40)


class TaskUpdate(TaskCreate):
    active: bool
    expectedRevision: Revision
