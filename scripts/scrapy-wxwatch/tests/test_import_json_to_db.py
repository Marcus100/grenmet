import pytest

from scripts.import_json_to_db import collect_rows, resolve_images_root


def make_item(url, checksum, path, **overrides):
    item = {
        "name": "g16split.jpg",
        "spider_name": "cimss",
        "fetched_at": "2025-12-10T15:25:19.885008+00:00",
        "observation_time": "2025-12-10T12:00:00",
        "image_urls": [url],
        "images": [
            {"url": url, "path": path, "checksum": checksum, "status": "downloaded"}
        ],
    }
    item.update(overrides)
    return item


def empty_counters():
    return {
        "inserted": 0,
        "duplicate": 0,
        "missing_file": 0,
        "no_image": 0,
        "no_timestamp": 0,
    }


@pytest.fixture
def stored_image(tmp_path):
    """An archive root containing one real file at a known relative path."""
    path = "2025/12/10/12/202512101200_g16split.jpg"
    target = tmp_path / path
    target.parent.mkdir(parents=True)
    target.write_bytes(b"jpeg-bytes")
    return tmp_path, path


def test_rows_are_built_for_items_whose_image_is_on_disk(stored_image):
    root, path = stored_image
    counters = empty_counters()

    rows = collect_rows(
        [make_item("https://example.test/a.jpg", "abc", path)],
        set(),
        root,
        counters,
    )

    assert len(rows) == 1
    assert rows[0][0] == path
    assert rows[0][9] == "https://example.test/a.jpg"
    assert rows[0][15] == "abc"


def test_items_already_in_the_database_are_not_reimported(stored_image):
    root, path = stored_image
    counters = empty_counters()
    seen = {("https://example.test/a.jpg", "abc")}

    rows = collect_rows(
        [make_item("https://example.test/a.jpg", "abc", path)],
        seen,
        root,
        counters,
    )

    assert rows == []
    assert counters["duplicate"] == 1


def test_repeats_within_the_archive_are_imported_once(stored_image):
    """The archive records the same image across many crawl runs."""
    root, path = stored_image
    counters = empty_counters()
    item = make_item("https://example.test/a.jpg", "abc", path)

    rows = collect_rows([item, item, item], set(), root, counters)

    assert len(rows) == 1
    assert counters["duplicate"] == 2


def test_items_whose_image_is_missing_are_skipped(tmp_path):
    """Inserting these would render as a broken image in the admin UI."""
    counters = empty_counters()

    rows = collect_rows(
        [make_item("https://example.test/a.jpg", "abc", "2025/12/10/12/gone.jpg")],
        set(),
        tmp_path,
        counters,
    )

    assert rows == []
    assert counters["missing_file"] == 1


def test_file_checks_are_skipped_when_the_store_is_unknown():
    counters = empty_counters()

    rows = collect_rows(
        [make_item("https://example.test/a.jpg", "abc", "2025/12/10/12/gone.jpg")],
        set(),
        None,
        counters,
    )

    assert len(rows) == 1
    assert counters["missing_file"] == 0


def test_items_without_a_download_are_skipped(stored_image):
    root, _ = stored_image
    counters = empty_counters()

    rows = collect_rows(
        [make_item("https://example.test/a.jpg", "abc", "x", images=[])],
        set(),
        root,
        counters,
    )

    assert rows == []
    assert counters["no_image"] == 1


def test_items_without_a_usable_timestamp_are_skipped(stored_image):
    root, path = stored_image
    counters = empty_counters()

    rows = collect_rows(
        [make_item("https://example.test/a.jpg", "abc", path, fetched_at="")],
        set(),
        root,
        counters,
    )

    assert rows == []
    assert counters["no_timestamp"] == 1


def test_images_root_falls_back_to_the_configured_image_store(monkeypatch):
    monkeypatch.setenv("IMAGES_STORE", "/srv/wxwatch/images")

    assert str(resolve_images_root(None)) == "/srv/wxwatch/images"


def test_remote_image_stores_cannot_be_verified_locally(monkeypatch):
    monkeypatch.setenv("IMAGES_STORE", "s3://grenmet-assets/wxwatch/")

    assert resolve_images_root(None) is None


def test_an_explicit_images_root_overrides_the_environment(monkeypatch):
    monkeypatch.setenv("IMAGES_STORE", "/srv/wxwatch/images")

    assert str(resolve_images_root("/tmp/other")) == "/tmp/other"
