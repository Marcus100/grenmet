"""Create-once seeds for the FastAPI-owned GAA catalogues."""

from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path
from typing import Any

import psycopg

ROOT = Path(__file__).resolve().parents[1]


def slugify(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def frequency(value: str) -> tuple[int, int, str]:
    match = re.fullmatch(r"(\d+)/(\d+)(min)?", value.strip())
    if not match:
        raise ValueError(f"Invalid frequency code: {value!r}")
    return int(match[1]), int(match[2]), "minute" if match[3] else "day"


def seed_janitorial(conn: psycopg.Connection[Any], apply: bool) -> None:
    path = ROOT / "seed" / "janitorial-spec.csv"
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not apply:
        print(f"janitorial preview: {len(rows)} source rows")
        return
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(73190506)")
            cur.execute("SELECT count(*) FROM buildings")
            if cur.fetchone()[0]:
                print("janitorial already initialised; preserving catalogue")
                return
            buildings: dict[str, int] = {}
            sections: dict[tuple[str, str], int] = {}
            areas: dict[tuple[str, str | None, str], int] = {}
            activities: dict[str, int] = {}
            bundles: dict[str, int] = {}
            area_order: dict[tuple[str, str | None], int] = {}
            section_order: dict[str, int] = {}
            task_order: dict[int, int] = {}
            bundle_order: dict[str, int] = {}

            def building_id(name: str) -> int:
                code = slugify(name)
                if code not in buildings:
                    cur.execute(
                        "INSERT INTO buildings(name,code,sort_order) VALUES (%s,%s,%s) RETURNING id",
                        (name, code, len(buildings)),
                    )
                    buildings[code] = cur.fetchone()[0]
                return buildings[code]

            def section_id(building: str, name: str) -> int:
                key = (building, name)
                if key not in sections:
                    cur.execute(
                        "INSERT INTO sections(building_id,name,sort_order) VALUES (%s,%s,%s) RETURNING id",
                        (building_id(building), name, section_order.get(building, 0)),
                    )
                    sections[key] = cur.fetchone()[0]
                    section_order[building] = section_order.get(building, 0) + 1
                return sections[key]

            def area_id(building: str, section: str | None, name: str) -> int:
                key = (building, section, name)
                if key not in areas:
                    group = (building, section)
                    cur.execute(
                        "INSERT INTO areas(building_id,section_id,name,sort_order) VALUES (%s,%s,%s,%s) RETURNING id",
                        (
                            building_id(building),
                            section_id(building, section) if section else None,
                            name,
                            area_order.get(group, 0),
                        ),
                    )
                    areas[key] = cur.fetchone()[0]
                    area_order[group] = area_order.get(group, 0) + 1
                return areas[key]

            def activity_id(name: str) -> int:
                slug = slugify(name)
                if slug not in activities:
                    cur.execute(
                        "INSERT INTO activities(slug,name) VALUES (%s,%s) RETURNING id",
                        (slug, name),
                    )
                    activities[slug] = cur.fetchone()[0]
                return activities[slug]

            def bundle_id(name: str) -> int:
                slug = slugify(name)
                if slug not in bundles:
                    cur.execute(
                        "INSERT INTO task_bundles(slug,name) VALUES (%s,%s) RETURNING id",
                        (slug, name),
                    )
                    bundles[slug] = cur.fetchone()[0]
                return bundles[slug]

            for row in rows:
                kind = row["kind"].strip()
                if kind == "task":
                    aid = area_id(
                        row["building"].strip(),
                        row["section"].strip() or None,
                        row["area"].strip(),
                    )
                    activity = activity_id(row["activity"].strip())
                    count, period, unit = frequency(row["frequency"])
                    cur.execute(
                        "INSERT INTO area_tasks(area_id,activity_id,freq_count,freq_period_value,freq_period_unit,mode,sort_order) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                        (
                            aid,
                            activity,
                            count,
                            period,
                            unit,
                            row["mode"].strip() or None,
                            task_order.get(aid, 0),
                        ),
                    )
                    task_order[aid] = task_order.get(aid, 0) + 1
                elif kind == "bundle_item":
                    bundle = row["area"].strip()
                    bid = bundle_id(bundle)
                    activity = activity_id(row["activity"].strip())
                    count, period, unit = frequency(row["frequency"])
                    cur.execute(
                        "INSERT INTO task_bundle_items(bundle_id,activity_id,freq_count,freq_period_value,freq_period_unit,sort_order) VALUES (%s,%s,%s,%s,%s,%s)",
                        (
                            bid,
                            activity,
                            count,
                            period,
                            unit,
                            bundle_order.get(bundle, 0),
                        ),
                    )
                    bundle_order[bundle] = bundle_order.get(bundle, 0) + 1
                elif kind == "bundle_ref":
                    aid = area_id(
                        row["building"].strip(),
                        row["section"].strip() or None,
                        row["area"].strip(),
                    )
                    cur.execute(
                        "INSERT INTO area_bundle_refs(area_id,bundle_id,sort_order) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                        (aid, bundle_id(row["activity"].strip()), 0),
                    )
            print(f"seeded janitorial: {len(buildings)} buildings, {len(areas)} areas")


def parse_time(value: str) -> str:
    value = value.strip().lower().replace(".", "")
    match = re.fullmatch(r"(\d{1,2}):(\d{2})\s*(am|pm|noon)?", value)
    if not match:
        raise ValueError(f"Invalid time: {value!r}")
    hour, minute = int(match[1]), int(match[2])
    meridiem = match[3]
    if meridiem == "noon":
        hour = 12
    elif meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def seed_transport(conn: psycopg.Connection[Any], apply: bool) -> None:
    path = ROOT / "seed" / "transport-routes.csv"
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not apply:
        print(f"transport preview: {len(rows)} source rows")
        return
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(73190506)")
            cur.execute("SELECT count(*) FROM routes")
            if cur.fetchone()[0]:
                print("transport already initialised; preserving timetable")
                return
            cur.execute(
                "INSERT INTO shifts(slug,name,start_time,end_time,sort_order) VALUES ('morning','Morning','05:30','14:00',0),('afternoon','Afternoon','14:00','22:30',1),('night','Night','22:30','06:00',2),('non_shift','Non-Shift','08:00','16:00',3) ON CONFLICT DO NOTHING"
            )
            shifts = {
                row[0]: row[1]
                for row in cur.execute("SELECT slug,id FROM shifts").fetchall()
            }
            routes: dict[int, int] = {}
            stops: dict[str, int] = {}
            trips: dict[tuple[int, str, str, str], int] = {}
            trip_order: dict[int, int] = {}
            stop_order: dict[int, int] = {}
            current: int | None = None
            for row in rows:
                if row["kind"] == "trip":
                    number = int(row["route"])
                    if number not in routes:
                        cur.execute(
                            "INSERT INTO routes(number,name,sort_order) VALUES (%s,%s,%s) RETURNING id",
                            (number, row["route_name"], len(routes)),
                        )
                        routes[number] = cur.fetchone()[0]
                    key = (number, row["shift"], row["direction"], row["day_type"])
                    cur.execute(
                        "INSERT INTO trips(route_id,shift_id,direction,day_type,depart_time,arrive_time,sort_order) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                        (
                            routes[number],
                            shifts[row["shift"]],
                            row["direction"],
                            row["day_type"],
                            parse_time(row["depart"]),
                            parse_time(row["arrive"])
                            if row["arrive"].strip()
                            else None,
                            trip_order.get(routes[number], 0),
                        ),
                    )
                    current = cur.fetchone()[0]
                    trips[key] = current
                    trip_order[routes[number]] = trip_order.get(routes[number], 0) + 1
                elif row["kind"] == "stop" and current is not None:
                    slug = slugify(row["stop"])
                    if slug not in stops:
                        cur.execute(
                            "INSERT INTO stops(slug,name,sort_order) VALUES (%s,%s,%s) RETURNING id",
                            (slug, row["stop"], len(stops)),
                        )
                        stops[slug] = cur.fetchone()[0]
                    cur.execute(
                        "INSERT INTO trip_stops(trip_id,stop_id,group_time,sort_order) VALUES (%s,%s,%s,%s)",
                        (
                            current,
                            stops[slug],
                            parse_time(row["group_time"])
                            if row["group_time"].strip()
                            else None,
                            stop_order.get(current, 0),
                        ),
                    )
                    stop_order[current] = stop_order.get(current, 0) + 1
            print(
                f"seeded transport: {len(routes)} routes, {len(trips)} trips, {len(stops)} stops"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    janitorial_url = os.environ.get("JANITORIAL_DATABASE_URL")
    transport_url = os.environ.get("TRANSPORT_DATABASE_URL")
    if not janitorial_url or not transport_url:
        raise SystemExit(
            "JANITORIAL_DATABASE_URL and TRANSPORT_DATABASE_URL are required"
        )
    with psycopg.connect(janitorial_url) as conn:
        seed_janitorial(conn, args.apply)
    with psycopg.connect(transport_url) as conn:
        seed_transport(conn, args.apply)


if __name__ == "__main__":
    main()
