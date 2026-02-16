"""Base spider class with shared utilities for weather image spiders."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import scrapy


class WeatherSpider(scrapy.Spider):
    """
    Base class with shared utilities for weather image spiders.
    
    Provides common methods for:
    - Parsing HTTP headers (ETag, Content-Type, etc.)
    - Handling request errors
    - Parsing dates, sizes, and text cleanup
    """

    def parse_headers(self, response):
        """
        Parse HTTP headers from a HEAD request and yield the item.
        
        Expects response.meta["item"] to contain the ImageItem.
        """
        item = response.meta["item"]

        item["etag"] = self._decode_header(response.headers.get("ETag"))

        # Store HTTP headers in raw_metadata for debugging/reference
        item["raw_metadata"]["http_status"] = response.status
        item["raw_metadata"]["content_type"] = self._decode_header(
            response.headers.get("Content-Type")
        )
        item["raw_metadata"]["content_length"] = self._parse_int_header(
            response.headers.get("Content-Length")
        )
        item["raw_metadata"]["server"] = self._decode_header(
            response.headers.get("Server")
        )
        last_modified_http = self._decode_header(
            response.headers.get("Last-Modified")
        )
        item["raw_metadata"]["last_modified_http"] = last_modified_http

        # If source_modified not already set, derive from Last-Modified HTTP header
        if not item.get("source_modified") and last_modified_http:
            item["source_modified"] = self._parse_http_date_iso(last_modified_http)

        # If observation_time not already set by spider, use source_modified
        if not item.get("observation_time") and item.get("source_modified"):
            item["observation_time"] = item["source_modified"]

        yield item

    def handle_error(self, failure):
        """
        Handle request errors gracefully, still yielding the item.
        
        Expects failure.request.meta["item"] to contain the ImageItem.
        """
        item = failure.request.meta["item"]
        self.logger.error(
            "Failed to fetch headers for %s: %s", item["image_urls"][0], failure
        )
        item["raw_metadata"]["http_status"] = (
            getattr(failure.value, "response", None).status
            if getattr(failure.value, "response", None)
            else None
        )
        yield item

    @staticmethod
    def _clean_text(value):
        """Strip whitespace from text, return None if empty."""
        return value.strip() if value else None

    @staticmethod
    def _parse_datetime(value):
        """Parse datetime string and return datetime object for comparison."""
        if not value:
            return None
        for fmt in ("%d-%b-%Y %H:%M", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_datetime_iso(value):
        """Parse datetime string and return ISO 8601 string."""
        if not value:
            return None
        for fmt in ("%d-%b-%Y %H:%M", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(value, fmt).isoformat()
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_http_date_iso(value):
        """Parse HTTP date format and return ISO 8601 string.
        
        HTTP dates follow RFC 7231 format, e.g.:
        - "Fri, 05 Dec 2025 20:52:31 GMT"
        """
        if not value:
            return None
        try:
            dt = parsedate_to_datetime(value)
            return dt.astimezone(timezone.utc).isoformat()
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_size(value):
        """Parse human-readable size (e.g., '192K', '10M') to bytes."""
        if not value:
            return None
        cleaned = value.strip().lower()
        if cleaned in {"-", ""}:
            return None

        multipliers = {"k": 1024, "m": 1024**2, "g": 1024**3}

        if cleaned[-1] in multipliers:
            try:
                return int(float(cleaned[:-1]) * multipliers[cleaned[-1]])
            except ValueError:
                return None

        try:
            return int(cleaned)
        except ValueError:
            return None

    @staticmethod
    def _decode_header(value):
        """Decode HTTP header bytes to string."""
        if not value:
            return None
        if isinstance(value, (bytes, bytearray)):
            try:
                return value.decode("utf-8")
            except UnicodeDecodeError:
                return value.decode("latin-1", errors="ignore")
        return value

    @staticmethod
    def _parse_int_header(value):
        """Parse HTTP header value as integer."""
        if not value:
            return None
        if isinstance(value, (bytes, bytearray)):
            value = value.decode("utf-8", errors="ignore")
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _round_to_hour(iso_str):
        """Round ISO datetime string down to the nearest hour.
        
        Used for CIMSS images where upload time is ~45 min after observation.
        Example: 12:45 → 12:00
        """
        if not iso_str:
            return None
        try:
            dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
            rounded = dt.replace(minute=0, second=0, microsecond=0)
            return rounded.isoformat()
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _round_to_synoptic(iso_str):
        """Round ISO datetime string down to the nearest 3-hour synoptic time.
        
        Used for surface analysis charts issued at synoptic times (00, 03, 06, 09, 12, 15, 18, 21z).
        Example: 21:47 → 18:00
        """
        if not iso_str:
            return None
        try:
            dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
            # Round down to nearest 3-hour interval
            synoptic_hour = (dt.hour // 3) * 3
            rounded = dt.replace(hour=synoptic_hour, minute=0, second=0, microsecond=0)
            return rounded.isoformat()
        except (ValueError, TypeError):
            return None

