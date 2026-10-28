"""Image storage and the WxWatch worker API, mirroring scripts/scrapy-wxwatch.

The collector holds no database credentials. It stores image bytes (local
archive directory or S3-compatible bucket), then sends metadata to FastAPI
with the shared worker token. Redirects are never followed with the token.
"""

import hashlib
import json
import os
import shutil
from collections.abc import Mapping
from dataclasses import dataclass
from http.client import HTTPMessage
from pathlib import Path
from typing import IO, Any
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

SOURCE = "gnca"
STORAGE_KEYS = (
    "STORAGE_ENDPOINT_URL",
    "STORAGE_BUCKET",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
)


class ConfigurationError(ValueError):
    """Settings are missing or unsafe."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Request,
        fp: IO[bytes],
        code: int,
        msg: str,
        headers: HTTPMessage,
        newurl: str,
    ) -> Request | None:
        return None


class ArchiveClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        parsed = urlparse(self.base_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ConfigurationError(
                "WXWATCH_API_URL must be an HTTP(S) URL without credentials"
            )
        if len(token) < 32:
            raise ConfigurationError(
                "WXWATCH_INGEST_TOKEN must contain at least 32 characters"
                " and match FastAPI"
            )
        self.token = token
        self.opener = build_opener(NoRedirect())

    def post(self, path: str, payload: Mapping[str, Any]) -> Any:
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
            # Never print request headers or arbitrary upstream bodies.
            raise RuntimeError(
                f"Archive API returned HTTP {exc.code} for {path}"
            ) from None

    def start_run(self) -> str:
        return str(self.post("/runs", {"source": SOURCE})["id"])

    def finish_run(self, run_id: str, status: str) -> None:
        self.post(f"/runs/{run_id}/finish", {"status": status})

    def ingest(self, payload: Mapping[str, Any]) -> Any:
        return self.post("/ingest", payload)


@dataclass(frozen=True, slots=True)
class Storage:
    """Local archive root, or an S3 bucket with the scrapy-wxwatch key prefix."""

    local_root: Path | None = None
    bucket: str | None = None
    prefix: str = "wxwatch"
    client: Any = None

    @classmethod
    def from_env(cls, environ: Mapping[str, str], local_root: Path) -> Storage:
        values = {key: environ.get(key, "").strip() for key in STORAGE_KEYS}
        configured = sum(bool(v) for v in values.values())
        if configured == 0:
            return cls(local_root=local_root)
        if configured != len(STORAGE_KEYS):
            missing = ", ".join(k for k, v in values.items() if not v)
            raise ConfigurationError(
                f"Incomplete object-storage configuration; missing: {missing}"
            )
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=values["STORAGE_ENDPOINT_URL"],
            region_name=environ.get("STORAGE_REGION", "us-east-1").strip()
            or "us-east-1",
            aws_access_key_id=values["STORAGE_ACCESS_KEY_ID"],
            aws_secret_access_key=values["STORAGE_SECRET_ACCESS_KEY"],
        )
        prefix = environ.get("STORAGE_PREFIX", "wxwatch").strip().strip("/")
        return cls(bucket=values["STORAGE_BUCKET"], prefix=prefix, client=client)

    def put(self, image: Path, storage_path: str) -> None:
        if self.client is not None:
            key = f"{self.prefix}/{storage_path}" if self.prefix else storage_path
            self.client.upload_file(
                str(image),
                self.bucket,
                key,
                ExtraArgs={"ContentType": "image/png", "ACL": "private"},
            )
            return
        assert self.local_root is not None
        target = self.local_root / storage_path
        if image.resolve() == target.resolve():
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image, target)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def client_from_env(environ: Mapping[str, str] = os.environ) -> ArchiveClient:
    return ArchiveClient(
        environ.get("WXWATCH_API_URL", "http://127.0.0.1:8000/api/v1/wxwatch"),
        environ.get("WXWATCH_INGEST_TOKEN", ""),
    )
