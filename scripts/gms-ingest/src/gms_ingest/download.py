"""Bounded streaming, conditional requests, verified cache reuse."""

import hashlib
import os
import tempfile
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .registry import allowed_url
from .storage import utc_now


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_url(newurl):
            raise ValueError(f"Redirect outside registered hosts/paths: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def retry_delay(header, attempt):
    if header:
        try:
            seconds = float(header)
        except ValueError:
            seconds = (
                parsedate_to_datetime(header) - datetime.now(UTC)
            ).total_seconds()
        if seconds > 60:
            raise ValueError(
                "Server Retry-After exceeds 60s; retry on a later invocation"
            )
        return max(0, seconds)
    return 2**attempt


class Downloader:
    def __init__(self, root, cache, opener=None, budget=4 * 1024**3):
        self.root, self.cache = root, cache
        self.opener = opener or build_opener(SafeRedirect())
        self.remaining = budget
        self.seen = {}
        (root / "objects").mkdir(parents=True, exist_ok=True)

    def fetch(self, product):
        url = product.url
        if not allowed_url(url):
            raise ValueError(f"Unregistered source URL: {url}")
        if url in self.seen:
            return self.seen[url]
        previous = self.cache.get(url, {})
        headers = {"User-Agent": "Grenmet-NHC-Collector/0.2"}
        cached = self.root / previous.get("raw_file", "absent")
        if cached.is_file():
            if previous.get("etag"):
                headers["If-None-Match"] = previous["etag"]
            if previous.get("last_modified"):
                headers["If-Modified-Since"] = previous["last_modified"]
        for attempt in range(3):
            temporary = None
            try:
                with self.opener.open(
                    Request(url, headers=headers), timeout=20
                ) as response:
                    descriptor, temporary = tempfile.mkstemp(
                        dir=self.root / "objects", prefix=".download-"
                    )
                    digest = hashlib.sha256()
                    size = 0
                    started = time.monotonic()
                    with os.fdopen(descriptor, "wb") as stream:
                        while chunk := response.read(1024 * 1024):
                            size += len(chunk)
                            self.remaining -= len(chunk)
                            if size > product.limit or self.remaining < 0:
                                raise ValueError(
                                    "Product or invocation download limit exceeded"
                                )
                            if time.monotonic() - started > 600:
                                raise TimeoutError("Download exceeded ten minutes")
                            stream.write(chunk)
                            digest.update(chunk)
                        stream.flush()
                        os.fsync(stream.fileno())
                    if not size:
                        raise ValueError("Empty response body")
                    sha = digest.hexdigest()
                    destination = self.root / "objects" / sha
                    # Replacing identical bytes also repairs a damaged cached object.
                    Path(temporary).replace(destination)
                    metadata = {
                        "url": url,
                        "retrieved_at": utc_now(),
                        "http_status": response.status,
                        "etag": response.headers.get("ETag"),
                        "last_modified": response.headers.get("Last-Modified"),
                        "content_type": response.headers.get("Content-Type"),
                        "sha256": sha,
                        "size": size,
                        "raw_file": str(destination.relative_to(self.root)),
                    }
                    self.cache[url] = metadata
                    self.seen[url] = metadata
                    return metadata
            except HTTPError as error:
                if error.code == 304 and cached.is_file():
                    with cached.open("rb") as stream:
                        sha = hashlib.file_digest(stream, "sha256").hexdigest()
                    if sha != previous.get("sha256"):
                        headers = {"User-Agent": headers["User-Agent"]}
                        if attempt == 2:
                            raise ValueError(
                                "Cached object checksum mismatch"
                            ) from error
                        continue
                    metadata = {**previous, "checked_at": utc_now(), "http_status": 304}
                    self.seen[url] = metadata
                    return metadata
                if error.code != 429 and not 500 <= error.code < 600:
                    raise
                if attempt == 2:
                    raise
                time.sleep(retry_delay(error.headers.get("Retry-After"), attempt))
            except (URLError, TimeoutError, ConnectionError, HTTPException):
                if attempt == 2:
                    raise
                time.sleep(2**attempt)
            finally:
                if temporary:
                    Path(temporary).unlink(missing_ok=True)
        raise RuntimeError("Request retries exhausted")
