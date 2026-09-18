"""Small collector client; never follows redirects carrying its worker credential."""

import json
import os
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ArchiveClient:
    def __init__(self, base_url=None, token=None):
        self.base_url = (
            base_url
            or os.getenv("WXWATCH_API_URL", "http://127.0.0.1:8000/api/v1/wxwatch")
        ).rstrip("/")
        self.token = token or os.getenv("WXWATCH_INGEST_TOKEN", "")
        parsed = urlparse(self.base_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ValueError(
                "WXWATCH_API_URL must be an HTTP(S) URL without credentials"
            )
        if len(self.token) < 32:
            raise ValueError(
                "WXWATCH_INGEST_TOKEN must contain at least 32 characters and match FastAPI"
            )
        self.opener = build_opener(NoRedirect())

    def post(self, path, payload):
        request = Request(
            self.base_url + path,
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=20) as response:
                data = response.read()
                return json.loads(data) if data else None
        except HTTPError as exc:
            # Do not print request headers or arbitrary upstream bodies.
            raise RuntimeError(
                f"Archive API returned HTTP {exc.code} for {path}"
            ) from None


def image_payload(item, run_id):
    image = item["images"][0]
    fields = (
        "name",
        "fetched_at",
        "observation_time",
        "source_modified",
        "width",
        "height",
        "file_size_bytes",
        "frame_count",
        "file_format",
        "is_animated",
        "parent_url",
        "page_title",
        "etag",
        "mode",
        "raw_metadata",
    )
    result = {key: item.get(key) for key in fields}
    for key in ("width", "height", "file_size_bytes", "frame_count"):
        if not result[key]:
            result[key] = None
    result["raw_metadata"] = result.get("raw_metadata") or {}
    result["time_basis"] = item.get("time_basis", "legacy_unknown")
    result.update(
        run_id=run_id,
        storage_path=image["path"],
        checksum=image["checksum"],
        image_url=item["image_urls"][0],
        download_status=image.get("status"),
    )
    return result
