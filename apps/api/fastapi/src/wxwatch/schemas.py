from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.models import BaseModel, UtcDateTime


class WeatherImage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    archive_observed_at: UtcDateTime | None = None
    archive_nominal_time: UtcDateTime | None = None
    first_retrieved_at: UtcDateTime | None = None
    latest_retrieved_at: UtcDateTime | None = None
    verification_status: str | None = None
    verified_sha256: str | None = None
    verified_byte_size: int | None = None
    replica_state: str | None = None
    product_key: str | None = None
    time_basis: str = "legacy_unknown"
    id: int
    storage_path: str
    width: int | None
    height: int | None
    spider_name: str | None
    file_format: str | None
    is_animated: bool | None
    file_size_bytes: int | None
    fetched_at: UtcDateTime
    name: str | None
    image_url: str | None
    parent_url: str | None
    page_title: str | None
    source_modified: UtcDateTime | None
    observation_time: UtcDateTime | None
    etag: str | None
    checksum: str | None
    download_status: str | None
    mode: str | None
    frame_count: int | None
    created_at: UtcDateTime | None


class SynopticSlots(BaseModel):
    h00: WeatherImage | None = Field(alias="00")
    h03: WeatherImage | None = Field(alias="03")
    h06: WeatherImage | None = Field(alias="06")
    h09: WeatherImage | None = Field(alias="09")
    h12: WeatherImage | None = Field(alias="12")
    h15: WeatherImage | None = Field(alias="15")
    h18: WeatherImage | None = Field(alias="18")
    h21: WeatherImage | None = Field(alias="21")


class SynopticImageGroup(BaseModel):
    productKey: str = ""
    name: str
    synopticImages: SynopticSlots


class SynopticImageGroups(BaseModel):
    groups: list[SynopticImageGroup]


class ArchiveEdition(BaseModel):
    image_asset_id: str | None = None
    issued_at: UtcDateTime | None = None
    storm_id: str | None = None
    bulletin_code: str | None = None
    has_bulletin: bool = False
    id: str
    title: str
    source: str
    product_key: str
    nominal_time: UtcDateTime | None
    observed_at: UtcDateTime | None
    time_basis: str
    first_received_at: UtcDateTime
    storage_path: str | None
    verification_status: str | None
    replica_state: str | None
    sha256: str | None
    byte_size: int | None


class ArchivePage(BaseModel):
    items: list[ArchiveEdition]
    has_more: bool
    offset: int


class ArchiveRetrieval(BaseModel):
    event_kind: str = "downloaded"
    checked_at: UtcDateTime | None = None
    is_imported: bool = False
    id: str
    retrieved_at: UtcDateTime | None
    recorded_at: UtcDateTime
    image_url: str


class ArchiveHistory(BaseModel):
    items: list[ArchiveRetrieval]
    has_more: bool
    offset: int


class ArchiveBulletin(BaseModel):
    edition_id: str
    text: str


class EditionAsset(BaseModel):
    asset_id: str
    role: str
    sha256: str
    byte_size: int
    media_type: str | None = None
