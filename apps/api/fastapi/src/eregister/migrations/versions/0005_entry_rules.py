"""Station settings for pressure reduction, and 78958 observed by hand every hour.

Additive on the eRegister chain only.

* ``observations.stations`` gains ``elevation_m`` and ``barometer_correction_hpa``
  (total barometer corrections, hPa). Both start empty on purpose: the station
  elevation and the corrections are not yet known, so no value is invented. The
  register shows its computed QFE and QNH as a dash, with a note that the values
  are pending, until staff enter them.
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


def upgrade() -> None:
    op.execute(
        "ALTER TABLE observations.stations"
        " ADD COLUMN elevation_m numeric(7, 2)"
        " CHECK (elevation_m BETWEEN -500 AND 9000)"
    )
    op.execute(
        "ALTER TABLE observations.stations"
        " ADD COLUMN barometer_correction_hpa numeric(5, 2)"
        " CHECK (barometer_correction_hpa BETWEEN -20 AND 20)"
    )
    op.execute("ALTER TABLE observations.stations ADD COLUMN settings_updated_by text")
    op.execute(
        """
        UPDATE observations.stations
        SET schedule = 'manual',
            manual_hours_utc = ARRAY[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[],
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
    op.execute("ALTER TABLE observations.stations DROP COLUMN barometer_correction_hpa")
    op.execute("ALTER TABLE observations.stations DROP COLUMN elevation_m")
