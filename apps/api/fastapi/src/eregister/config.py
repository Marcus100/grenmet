from pydantic_settings import BaseSettings, SettingsConfigDict


class ERegisterConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EREGISTER_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )
    DATABASE_URL: str | None = None
    # Comma-separated addresses that receive "Email observation". Unset means
    # the action answers 409 "No recipients configured".
    OBS_RECIPIENTS: str = ""
    # Sending needs a validated reading. QC acceptance has no workflow yet, so
    # by default drafts that pass validation may be sent; set true once QC
    # acceptance exists to require state "accepted".
    SEND_REQUIRE_ACCEPTED: bool = False

    @property
    def recipients(self) -> list[str]:
        seen: dict[str, None] = {}
        for item in self.OBS_RECIPIENTS.replace(";", ",").split(","):
            address = item.strip().lower()
            if address and "@" in address:
                seen.setdefault(address)
        return list(seen)


class Wis2boxConfig(BaseSettings):
    """Where the SYNOP CSV for wis2box's csv2bufr goes (no prefix: WIS2BOX_*)."""

    model_config = SettingsConfigDict(
        env_file=".env.local", extra="ignore", env_ignore_empty=True
    )
    # Local drop directory (a bind mount of the wis2box incoming data), or ...
    WIS2BOX_INCOMING_DIR: str | None = None
    # ... the wis2box MinIO/S3 `wis2box-incoming` bucket.
    WIS2BOX_S3_ENDPOINT_URL: str | None = None
    WIS2BOX_S3_BUCKET: str = "wis2box-incoming"
    WIS2BOX_S3_ACCESS_KEY_ID: str | None = None
    WIS2BOX_S3_SECRET_ACCESS_KEY: str | None = None
    # Must equal the wis2box dataset topic exactly (object key prefix).
    WIS2BOX_TOPIC_HIERARCHY: str = (
        "origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop"
    )
    WIS2BOX_MAX_ATTEMPTS: int = 5
    # Station metadata the CSV needs (MBIA, 78958); public values.
    WIS2BOX_WIGOS_ID: str = "0-20000-0-78958"
    WIS2BOX_STATION_LATITUDE: float = 12.0042
    WIS2BOX_STATION_LONGITUDE: float = -61.7862
    WIS2BOX_STATION_HEIGHT_M: float = 12.0
    WIS2BOX_BAROMETER_HEIGHT_M: float = 13.7
    WIS2BOX_THERMOMETER_HEIGHT_M: float = 1.7
    WIS2BOX_ANEMOMETER_HEIGHT_M: float = 10.0

    @property
    def sink(self) -> str | None:
        """Return "dir", "s3" or None when publication is not configured."""
        if self.WIS2BOX_INCOMING_DIR:
            return "dir"
        if (
            self.WIS2BOX_S3_ENDPOINT_URL
            and self.WIS2BOX_S3_ACCESS_KEY_ID
            and self.WIS2BOX_S3_SECRET_ACCESS_KEY
        ):
            return "s3"
        return None


eregister_settings = ERegisterConfig()
wis2box_settings = Wis2boxConfig()
