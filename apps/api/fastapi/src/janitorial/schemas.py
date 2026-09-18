from pydantic import BaseModel


class Frequency(BaseModel):
    count: int
    periodValue: int
    periodUnit: str


class TaskView(BaseModel):
    activity: str
    frequency: Frequency
    id: int
    mode: str | None


class BundleItem(BaseModel):
    activity: str
    frequency: Frequency


class BundleView(BaseModel):
    id: int
    items: list[BundleItem]
    name: str


class AreaView(BaseModel):
    bundles: list[BundleView]
    id: int
    name: str
    tasks: list[TaskView]


class SectionView(BaseModel):
    areas: list[AreaView]
    id: int | None
    name: str | None


class BuildingView(BaseModel):
    id: int
    name: str
    sections: list[SectionView]
