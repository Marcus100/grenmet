-- Hourly synthetic observation seed for the WIS2 soak test (pilot station id 1).
-- Computes the current UTC top-of-hour itself; safe to re-run (upsert).
-- Values vary by hour so successive BUFRs differ. Units are SURFACE-internal
-- (degC, %, m/s, deg, hPa) — the publisher converts to K/Pa at CSV build time.
-- quality_flag 1 = NOT_CHECKED (pre-QC publishing per ADR-0010).

WITH h AS (
  SELECT date_trunc('hour', now()) AS ts,
         extract(hour FROM now() AT TIME ZONE 'utc')::int AS hr
)
INSERT INTO raw_data (datetime, station_id, variable_id, measured, quality_flag)
SELECT h.ts, 1, v.variable_id, v.measured, 1
FROM h
CROSS JOIN LATERAL (
  VALUES
    (10, (26.0 + 3.0 * sin(radians(h.hr * 15.0)))::float8),          -- air temp degC
    (19, (21.5 + 3.0 * sin(radians(h.hr * 15.0)))::float8),          -- dewpoint degC
    (30, (70 + h.hr % 10)::float8),                                  -- RH %
    (51, (4.0 + (h.hr % 5) * 0.7)::float8),                          -- wind speed m/s
    (56, ((80 + h.hr * 10) % 360)::float8),                          -- wind dir deg
    (60, (1009.0 + 2.0 * sin(radians(h.hr * 30.0)))::float8),        -- station pressure hPa
    (61, (1010.4 + 2.0 * sin(radians(h.hr * 30.0)))::float8)         -- MSL pressure hPa
) AS v(variable_id, measured)
ON CONFLICT (datetime, station_id, variable_id)
DO UPDATE SET measured = EXCLUDED.measured;

-- Precipitation summary (variable 0); the publisher's freshness gate also
-- requires a current-hour hourly_summary row. History accumulates run by run.
INSERT INTO hourly_summary
  (datetime, station_id, variable_id, min_value, max_value, avg_value,
   sum_value, num_records, created_at, updated_at)
SELECT date_trunc('hour', now()), 1, 0, 0, 0.2, 0.05, 0.2, 60, now(), now()
ON CONFLICT (datetime, station_id, variable_id)
DO UPDATE SET sum_value = EXCLUDED.sum_value, updated_at = now();

SELECT 'seeded ' || date_trunc('hour', now()) AS result;
