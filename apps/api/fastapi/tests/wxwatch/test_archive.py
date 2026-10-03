from uuid import uuid4

from sqlalchemy import text

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.main import app
from src.wxwatch import catalogue
from tests.wxwatch.test_gallery import image_database as image_database


async def test_archive_filters_pagination_unknown_and_history(
    async_client, image_database, weather_engine
):
    assert image_database is None
    url = "/api/v1/wxwatch/archive"
    assert (await async_client.get(url)).status_code == 401
    with weather_engine.begin() as c:
        row = dict(
            c.execute(text("SELECT * FROM weather_images LIMIT 1")).mappings().one()
        )
        edition = catalogue.catalogue_record(c, row)
        c.execute(
            text("""INSERT INTO weather_images(storage_path,fetched_at,observation_time,name,spider_name,product_key)
            VALUES ('unknown.png','2026-09-17T08:00:00Z',NULL,'unknown.png','cimss','unknown')""")
        )
        other = dict(
            c.execute(text("SELECT * FROM weather_images WHERE name='unknown.png'"))
            .mappings()
            .one()
        )
        catalogue.catalogue_record(c, other)
        run = uuid4()
        c.execute(
            text("INSERT INTO collection_runs(id,source) VALUES (:id,'goes19')"),
            {"id": run},
        )
        for hour in (8, 9):
            c.execute(
                text("""INSERT INTO archive_retrievals(id,edition_id,run_id,retrieved_at,image_url,storage_path,checksum,source_metadata)
                VALUES (:id,:edition,:run,:time,'https://example.test/chart','cloud.png','abc','{}')"""),
                {
                    "id": uuid4(),
                    "edition": edition,
                    "run": run,
                    "time": row["fetched_at"].replace(hour=hour),
                },
            )
    app.dependency_overrides[get_browser_or_token_user] = lambda: User(
        email="staff@example.test"
    )
    try:
        result = await async_client.get(url + "?limit=1")
        assert result.status_code == 200, result.text
        assert result.headers["cache-control"] == "private, no-store"
        assert result.json()["has_more"] is True
        second = (await async_client.get(url + "?limit=1&offset=1")).json()
        assert second["items"][0]["id"] != result.json()["items"][0]["id"]
        assert second["has_more"] is False
        known = (
            await async_client.get(
                url + "?source=goes19&product=cloud&start=2026-09-17&end=2026-09-17"
            )
        ).json()
        assert len(known["items"]) == 1
        unknown = (await async_client.get(url + "?unknown_time=true")).json()
        assert (
            len(unknown["items"]) == 1 and unknown["items"][0]["nominal_time"] is None
        )
        assert (
            await async_client.get(url + "?unknown_time=true&start=2026-09-17")
        ).status_code == 422
        assert (
            await async_client.get(url + "?start=2026-09-18&end=2026-09-17")
        ).status_code == 422
        assert (await async_client.get(url + "?limit=101")).status_code == 422
        assert (await async_client.get(url + "?product=%27%20OR%201=1")).json()[
            "items"
        ] == []
        history = (await async_client.get(f"{url}/{edition}/retrievals?limit=1")).json()
        assert history["has_more"] is True
        assert "09:00:00" in history["items"][0]["retrieved_at"]
        assert (
            await async_client.get(f"{url}/{uuid4()}/retrievals")
        ).status_code == 404
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)
