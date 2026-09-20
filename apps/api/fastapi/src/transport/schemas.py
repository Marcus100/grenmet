from src.models import BaseModel


class StopView(BaseModel):
    groupTime: str | None
    id: int
    name: str


class TripView(BaseModel):
    arriveTime: str | None
    dayType: str
    departTime: str
    direction: str
    id: int
    stops: list[StopView]


class ShiftView(BaseModel):
    endTime: str
    id: int
    name: str
    startTime: str
    trips: list[TripView]


class RouteView(BaseModel):
    id: int
    name: str
    number: int
    shifts: list[ShiftView]
