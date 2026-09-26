from fastapi import APIRouter
from sqlalchemy import text

from src.auth.browser import BrowserUser

from .dependencies import TransportSession as Session
from .dependencies import get_session
from .schemas import RouteView, ShiftView, StopView, TripView
from .timetable.router import router as timetable_router

__all__ = ["get_session", "router"]

router = APIRouter(prefix="/transport", tags=["transport"])
router.include_router(timetable_router)


@router.get(
    "/spec",
    response_model=list[RouteView],
    summary="Get the transport timetable",
    description="Deprecated: returns the v1 catalogue, which no longer changes. Use /transport/timetable/current, which follows published timetable versions.",
    deprecated=True,
)
async def spec(_user: BrowserUser, session: Session) -> list[RouteView]:
    route_rows = (
        (
            await session.execute(
                text("SELECT id, number, name FROM routes ORDER BY sort_order")
            )
        )
        .mappings()
        .all()
    )
    shift_rows = (
        (
            await session.execute(
                text(
                    "SELECT id, name, start_time::text AS start_time, end_time::text AS end_time FROM shifts ORDER BY sort_order"
                )
            )
        )
        .mappings()
        .all()
    )
    trip_rows = (
        (
            await session.execute(
                text(
                    "SELECT id, route_id, shift_id, direction, day_type, depart_time::text AS depart_time, arrive_time::text AS arrive_time FROM trips ORDER BY sort_order"
                )
            )
        )
        .mappings()
        .all()
    )
    stop_rows = (
        (
            await session.execute(
                text("""
        SELECT ts.id, ts.trip_id, s.name, ts.group_time::text AS group_time
        FROM trip_stops ts JOIN stops s ON s.id=ts.stop_id ORDER BY ts.trip_id, ts.sort_order
    """)
            )
        )
        .mappings()
        .all()
    )
    stops_by_trip: dict[int, list[StopView]] = {}
    for row in stop_rows:
        stops_by_trip.setdefault(row["trip_id"], []).append(
            StopView(id=row["id"], name=row["name"], groupTime=row["group_time"])
        )
    trips_by_route_shift: dict[tuple[int, int], list[TripView]] = {}
    for row in trip_rows:
        trips_by_route_shift.setdefault((row["route_id"], row["shift_id"]), []).append(
            TripView(
                id=row["id"],
                direction=row["direction"],
                dayType=row["day_type"],
                departTime=row["depart_time"],
                arriveTime=row["arrive_time"],
                stops=stops_by_trip.get(row["id"], []),
            )
        )
    return [
        RouteView(
            id=row["id"],
            number=row["number"],
            name=row["name"],
            shifts=[
                ShiftView(
                    id=shift["id"],
                    name=shift["name"],
                    startTime=shift["start_time"],
                    endTime=shift["end_time"],
                    trips=trips_by_route_shift.get((row["id"], shift["id"]), []),
                )
                for shift in shift_rows
                if (row["id"], shift["id"]) in trips_by_route_shift
            ],
        )
        for row in route_rows
    ]
