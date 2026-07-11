"""Seed top-of-hour test observations for the pilot station into SURFACE.

Inserts the raw_data variables SURFACE's WIS2 publisher reads (tasks.py
get_aws_data: 10 T, 19 Td, 30 RH, 51 wind spd, 56 wind dir, 60/61 pressure hPa)
plus hourly_summary precipitation (variable_id 0), for the current UTC hour.
Idempotent — re-run any hour to keep the pilot publishable. quality_flag=1
(NOT_CHECKED) matches real pre-QC data (ADR-0010).

Run (devcontainer):  MINIO unused; DB via host.docker.internal:5433
  export DBPW=$(grep '^SURFACE_DB_PASSWORD=' surface/api/production.env | cut -d= -f2)
  uv run --with 'psycopg[binary]' python3 scripts/wis2-setup/seed-surface-obs.py
Run (host): same, with SURFACE_DB_HOST=localhost
"""

import datetime as dt
import os

import psycopg

STATION_ID = int(os.environ.get("STATION_ID", "1"))
HOST = os.environ.get("SURFACE_DB_HOST", "host.docker.internal")

# variable_id -> measured value in SURFACE-internal units (degC, %, m/s, deg, hPa)
RAW_VALUES = {
    10: 28.4,   # air temperature degC
    19: 24.1,   # dewpoint degC
    30: 77,     # relative humidity %
    51: 5.8,    # wind speed m/s
    56: 100,    # wind direction deg
    60: 1010.2, # station pressure hPa
    61: 1011.6, # MSL pressure hPa
}

now_hour = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)

conn = psycopg.connect(host=HOST, port=5433, dbname="surface_db", user="dba",
                       password=os.environ["DBPW"], autocommit=True)
cur = conn.cursor()

for var_id, measured in RAW_VALUES.items():
    cur.execute(
        """INSERT INTO raw_data (datetime, station_id, variable_id, measured, quality_flag)
           VALUES (%s, %s, %s, %s, 1)
           ON CONFLICT (datetime, station_id, variable_id)
           DO UPDATE SET measured = EXCLUDED.measured""",
        (now_hour, STATION_ID, var_id, measured),
    )

# precipitation: current hour + 3 prior hours so 1h/3h totals resolve
for hours_back in range(0, 4):
    ts = now_hour - dt.timedelta(hours=hours_back)
    cur.execute(
        """INSERT INTO hourly_summary
             (datetime, station_id, variable_id, min_value, max_value, avg_value,
              sum_value, num_records, created_at, updated_at)
           VALUES (%s, %s, 0, 0, 0.2, 0.05, 0.2, 60, now(), now())
           ON CONFLICT (datetime, station_id, variable_id)
           DO UPDATE SET sum_value = EXCLUDED.sum_value, updated_at = now()""",
        (ts, STATION_ID),
    )

cur.execute("SELECT count(*) FROM raw_data WHERE station_id=%s AND datetime=%s", (STATION_ID, now_hour))
raw_n = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM hourly_summary WHERE station_id=%s", (STATION_ID,))
hs_n = cur.fetchone()[0]
print(f"seeded {now_hour.isoformat()}: raw_data rows this hour={raw_n}, hourly_summary rows total={hs_n}")
