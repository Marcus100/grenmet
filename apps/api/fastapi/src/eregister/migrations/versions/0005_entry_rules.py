"""Station pressure amounts, and 78958 observed by hand every hour.

Additive on the eRegister chain only.

* ``observations.stations`` gains the fixed amounts the register uses to work out
  the pressures from the barometer as read (owner confirmed for 78958 on
  2026-10-24): ``total_correction_hpa`` (barometer as read plus this is the
  station pressure), ``qfe_offset_hpa`` (QFE = station pressure + this),
  ``sea_level_offset_hpa`` (mean sea level pressure = station pressure + this)
  and ``qnh_offset_hpa`` (QNH = mean sea level pressure + this). Other stations
  start empty: nothing is assumed for them.
* 78958 is seeded with 0.0, 0.3, 1.0 and 0.1 hPa. The sea level amount matches
  every hour of the Excel register (group 3 0157 gives group 4 0167).
* Owner decision 2026-10-23: all 24 hours are entered manually at 78958, so the
  station's schedule moves from ``automatic`` to ``manual`` with every UTC hour
  listed. The publish gate (ADR-0032) then lets eRegister claim any hour. The
  automatic station's own WIGOS identifier is still to be confirmed with GMS.
"""

from alembic import op

revision = "eregister_0005"
down_revision = "eregister_0004"
branch_labels = None
depends_on = None

AMOUNTS = (
    "total_correction_hpa",
    "qfe_offset_hpa",
    "sea_level_offset_hpa",
    "qnh_offset_hpa",
)


def upgrade() -> None:
    for column in AMOUNTS:
        op.execute(
            f"ALTER TABLE observations.stations ADD COLUMN {column} numeric(5, 2)"
            f" CHECK ({column} BETWEEN -20 AND 20)"
        )
    op.execute("ALTER TABLE observations.stations ADD COLUMN settings_updated_by text")
    op.execute(
        """
        UPDATE observations.stations
        SET schedule = 'manual',
            manual_hours_utc = ARRAY[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[],
            total_correction_hpa = 0.0,
            qfe_offset_hpa = 0.3,
            sea_level_offset_hpa = 1.0,
            qnh_offset_hpa = 0.1,
            settings_updated_by = 'owner-confirmed 2026-10-24',
            updated_at = now()
        WHERE station_id = '78958'
        """
    )


def downgrade() -> None:
    op.execute(
        "UPDATE observations.stations SET schedule = 'automatic',"
        " manual_hours_utc = '{}', updated_at = now() WHERE station_id = '78958'"
    )
    op.execute("ALTER TABLE observations.stations DROP COLUMN settings_updated_by")
    for column in reversed(AMOUNTS):
        op.execute(f"ALTER TABLE observations.stations DROP COLUMN {column}")
