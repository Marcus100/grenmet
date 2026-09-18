import hashlib
from datetime import UTC, datetime
from io import BytesIO

from PIL import Image
from sqlalchemy import text

from src.wxwatch import catalogue
from tests.wxproducts.test_migrations import weather_engine as weather_engine
from tests.wxwatch.test_migration import migrate


def png():
    buffer = BytesIO()
    Image.new("RGB", (8, 6), "blue").save(buffer, format="PNG")
    return buffer.getvalue()


def add_row(
    engine,
    path,
    checksum=None,
    name="chart.png",
    spider="cimss",
    url="https://example.test/chart.png",
    basis="legacy_unknown",
):
    with engine.begin() as connection:
        return connection.scalar(
            text("""INSERT INTO weather_images(storage_path,fetched_at,observation_time,name,spider_name,image_url,checksum,product_key,time_basis)
            VALUES (:path,:time,:time,:name,:spider,:url,:checksum,'old-key',:basis) RETURNING id"""),
            {
                "path": path,
                "time": datetime(2026, 9, 17, 12, tzinfo=UTC),
                "name": name,
                "spider": spider,
                "url": url,
                "checksum": checksum,
                "basis": basis,
            },
        )


def test_station_identity_is_stable_and_urls_do_not_collapse():
    first = {"id": 1, "spider_name": "uwyo", "name": "202609171200_skewt_78954.png"}
    second = first | {"id": 2, "name": "202609180000_skewt_78954.png"}
    assert catalogue.product_identity(first) == catalogue.product_identity(second)
    assert catalogue.product_identity(first)[2] == "wmo:78954"
    assert catalogue.product_identity(first) != catalogue.product_identity(
        first | {"name": "202609171200_skewt_78970.png"}
    )
    a = {
        "id": 1,
        "spider_name": "cimss",
        "name": "same.png",
        "image_url": "https://example.test/a.png?region=1",
    }
    assert catalogue.product_identity(a) != catalogue.product_identity(
        a | {"image_url": "https://example.test/a.png?region=2"}
    )


def test_batch_preserves_editions_deduplicates_bytes_and_is_repeatable(
    weather_engine, tmp_path
):
    migrate(weather_engine)
    body = png()
    checksum = hashlib.md5(body, usedforsecurity=False).hexdigest()
    for name in ("a.png", "b.png"):
        (tmp_path / name).write_bytes(body)
        add_row(weather_engine, name, checksum)
    first = catalogue.backfill_batch(
        weather_engine, root=tmp_path, backend="local-test", limit=1
    )
    assert first["processed"] == first["verified"] == 1
    second = catalogue.backfill_batch(
        weather_engine, root=tmp_path, backend="local-test", after_id=first["last_id"]
    )
    assert second["verified"] == 1
    catalogue.backfill_batch(weather_engine, root=tmp_path, backend="local-test")
    with weather_engine.connect() as connection:
        for table, count in [
            ("weather_images", 2),
            ("archive_products", 1),
            ("archive_editions", 2),
            ("archive_assets", 1),
            ("archive_replicas", 2),
            ("archive_legacy_images", 2),
        ]:
            query = "SELECT count(*) FROM " + table  # noqa: S608 -- fixed table names above
            assert connection.scalar(text(query)) == count
        edition = connection.execute(
            text(
                "SELECT observed_at,nominal_time,coverage,source_metadata FROM archive_editions LIMIT 1"
            )
        ).one()
        assert edition.observed_at is None and edition.nominal_time is not None
        assert edition.coverage is None
        assert edition.source_metadata["product_key"] == "old-key"
        assert (
            connection.scalar(text("SELECT sha256 FROM archive_assets"))
            == hashlib.sha256(body).hexdigest()
        )
        assert (
            connection.scalar(text("SELECT media_type FROM archive_assets"))
            == "image/png"
        )


def test_missing_mismatched_and_unverified_are_not_silently_verified(
    weather_engine, tmp_path
):
    migrate(weather_engine)
    (tmp_path / "bad.png").write_bytes(png())
    (tmp_path / "unknown.png").write_bytes(png())
    add_row(weather_engine, "missing.png")
    add_row(weather_engine, "bad.png", "0" * 32)
    add_row(weather_engine, "unknown.png")
    result = catalogue.backfill_batch(
        weather_engine, root=tmp_path, backend="local-test"
    )
    assert result["missing"] == result["mismatch"] == result["unverified"] == 1
    with weather_engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM archive_assets")) == 1
        assert (
            connection.scalar(
                text(
                    "SELECT integrity_basis FROM archive_legacy_images WHERE status='unverified'"
                )
            )
            == "current_bytes_only"
        )


def test_unsafe_paths_and_metadata_only(weather_engine, tmp_path):
    root = tmp_path / "images"
    root.mkdir()
    (tmp_path / "outside.png").write_bytes(png())
    (root / "escape.png").symlink_to(tmp_path / "outside.png")
    assert catalogue.inspect_file(root, "../outside.png", None)["status"] == "unsafe"
    assert catalogue.inspect_file(root, "escape.png", None)["status"] == "unsafe"
    migrate(weather_engine)
    add_row(weather_engine, "cloud/image.png")
    result = catalogue.backfill_batch(
        weather_engine, root=None, backend="cloud-primary"
    )
    assert result["pending"] == 1
    with weather_engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM archive_editions")) == 1
        assert connection.scalar(text("SELECT count(*) FROM archive_replicas")) == 0


def test_retry_preserves_metadata_only_and_tracks_missing_replica(
    weather_engine, tmp_path
):
    migrate(weather_engine)
    body = png()
    path = tmp_path / "retry.png"
    add_row(weather_engine, path.name, hashlib.sha256(body).hexdigest())
    assert (
        catalogue.backfill_batch(weather_engine, root=tmp_path, backend="local-test")[
            "missing"
        ]
        == 1
    )
    path.write_bytes(body)
    assert (
        catalogue.backfill_batch(weather_engine, root=tmp_path, backend="local-test")[
            "verified"
        ]
        == 1
    )
    assert (
        catalogue.backfill_batch(weather_engine, root=None, backend="local-test")[
            "verified"
        ]
        == 1
    )
    path.unlink()
    assert (
        catalogue.backfill_batch(weather_engine, root=tmp_path, backend="local-test")[
            "missing"
        ]
        == 1
    )
    with weather_engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT state FROM archive_replicas")) == "missing"
        )
        assert connection.scalar(text("SELECT count(*) FROM archive_assets")) == 1
    path.write_bytes(body)
    assert (
        catalogue.backfill_batch(weather_engine, root=tmp_path, backend="local-test")[
            "verified"
        ]
        == 1
    )


def test_animation_is_inspected_without_changing_bytes(tmp_path):
    path = tmp_path / "loop.gif"
    Image.new("RGB", (8, 6), "blue").save(
        path,
        save_all=True,
        append_images=[Image.new("RGB", (8, 6), "red")],
        duration=100,
        loop=0,
    )
    body = path.read_bytes()
    result = catalogue.inspect_file(
        tmp_path, path.name, hashlib.sha256(body).hexdigest()
    )
    assert result["status"] == "verified"
    assert result["frame_count"] == 2
    assert path.read_bytes() == body
