from datetime import datetime, timezone
import re

from app.items import ImageItem
from app.spiders.base import WeatherSpider


class Goes19Spider(WeatherSpider):
    name = "goes19"
    allowed_domains = ["cdn.star.nesdis.noaa.gov"]
    custom_settings = {
        "ROBOTSTXT_OBEY": False,
    }
    start_urls = [
        "https://cdn.star.nesdis.noaa.gov/GOES19/GLM/SECTOR/taw/EXTENT3/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/AirMass/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/Dust/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/02/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/08/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/09/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/10/",
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/13/",
    ]

    target_suffix = "7200x4320.jpg"

    # Pattern to match: filename followed by date and size
    # Example: 20253302126_GOES19-ABI-taw-13-7200x4320.jpg 26-Nov-2025 21:26 11234567
    line_pattern = re.compile(
        r'<a[^>]*href="([^"]*7200x4320\.jpg)"[^>]*>([^<]+)</a>\s+'
        r'(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2})\s+(\d+)'
    )

    # GOES filename pattern: YYYYDDDHHmm (Julian date + HHMM time)
    # Example: 20253392040_GOES19-ABI-taw-02.jpg = Dec 5, 2025 at 20:40z
    goes_time_pattern = re.compile(r'^(\d{4})(\d{3})(\d{2})(\d{2})_')

    def _extract_observation_time(self, filename):
        """Extract observation time from GOES filename.
        
        GOES filenames encode the observation time as:
        - YYYY: 4-digit year
        - DDD: 3-digit Julian day (001-366)
        - HH: 2-digit hour (00-23)
        - mm: 2-digit minute (00-59)
        """
        match = self.goes_time_pattern.match(filename)
        if not match:
            return None

        year, julian_day, hour, minute = match.groups()
        try:
            dt = datetime.strptime(f"{year}{julian_day}", "%Y%j")
            return dt.replace(
                hour=int(hour),
                minute=int(minute),
                tzinfo=timezone.utc
            ).isoformat()
        except ValueError:
            return None

    def parse(self, response):
        # Parse the <pre> block content using regex
        pre_content = response.xpath("//pre").get() or response.text
        matches = self.line_pattern.findall(pre_content)

        if not matches:
            self.logger.warning(
                "No files matching *%s found in %s", self.target_suffix, response.url
            )
            return

        # Find the latest file by parsing timestamps
        latest_match = None
        latest_dt = None

        for href, filename, date_str, size_str in matches:
            dt = self._parse_datetime(date_str)
            if dt and (latest_dt is None or dt > latest_dt):
                latest_dt = dt
                latest_match = (href, filename, date_str, size_str)

        if latest_match is None:
            self.logger.warning(
                "Could not determine latest file in %s", response.url
            )
            return

        href, filename, date_str, size_str = latest_match
        image_url = response.urljoin(href)

        # Extract observation time from GOES filename
        observation_time = self._extract_observation_time(filename)

        item = ImageItem()
        item["name"] = filename
        item["parent_url"] = response.url
        item["page_title"] = self._clean_text(response.xpath("//title/text()").get())
        item["source_modified"] = self._parse_datetime_iso(date_str)
        item["observation_time"] = observation_time
        item["fetched_at"] = datetime.now(timezone.utc).isoformat()
        item["image_urls"] = [image_url]
        item["etag"] = None
        item["raw_metadata"] = {
            "directory_path": response.url.rstrip("/"),
            "last_modified_raw": date_str,
            "size_text": size_str,
            "size_bytes": self._parse_size(size_str),
        }

        request = response.follow(
            image_url,
            method="HEAD",
            callback=self.parse_headers,
            errback=self.handle_error,
            meta={"item": item},
            dont_filter=True,
        )
        yield request
