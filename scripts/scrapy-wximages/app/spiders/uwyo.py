"""Spider for University of Wyoming Atmospheric Science Radiosonde Archive.

Downloads Skew-T PNG soundings from https://weather.uwyo.edu/upperair/sounding.shtml
"""

from datetime import datetime, timezone

import scrapy

from app.items import ImageItem
from app.spiders.base import WeatherSpider


class UwyoSpider(WeatherSpider):
    name = "uwyo"
    allowed_domains = ["weather.uwyo.edu"]
    start_urls = ["https://weather.uwyo.edu/upperair/sounding.shtml"]

    # Configurable list of station IDs to fetch
    # 78954 = GRANTLEY ADAMS, BARBADOS
    STATIONS = ["78954", "78970"]

    # Sounding times (UTC hours)
    SOUNDING_HOURS = [0, 12]

    def __init__(self, date=None, *args, **kwargs):
        """Initialize spider with optional date argument.

        Args:
            date: Date string in YYYY-MM-DD format. Defaults to today.
        """
        super().__init__(*args, **kwargs)
        if date:
            self.target_date = datetime.strptime(date, "%Y-%m-%d").date()
        else:
            self.target_date = datetime.now(timezone.utc).date()

    def parse(self, response):
        """Parse the form page and submit requests for each station/time combo."""
        for station in self.STATIONS:
            for hour in self.SOUNDING_HOURS:
                # Build datetime string for form submission
                dt_str = f"{self.target_date.isoformat()} {hour:02d}:00:00"

                # Submit form request
                yield scrapy.FormRequest.from_response(
                    response,
                    formdata={
                        "date": self.target_date.isoformat(),
                        "datetime": dt_str,
                        "id": station,
                        "type": "PNG:SKEWT",
                        "src": "BUFR",
                    },
                    callback=self.parse_result,
                    meta={
                        "station": station,
                        "hour": hour,
                        "date": self.target_date.isoformat(),
                    },
                    dont_filter=True,
                )

    def parse_result(self, response):
        """Parse the result page and extract the Skew-T image."""
        station = response.meta["station"]
        hour = response.meta["hour"]
        date_str = response.meta["date"]

        # Find the embedded Skew-T image
        # Image URL pattern: /upperair/imgs/YYYYMMDDHH.STATION.skewt.png
        img_src = response.xpath("//img[contains(@src, 'skewt.png')]/@src").get()

        if not img_src:
            self.logger.warning(
                "No Skew-T image found for station %s at %02dZ on %s",
                station,
                hour,
                date_str,
            )
            return

        image_url = response.urljoin(img_src)

        # Build observation time ISO string
        obs_dt = datetime.strptime(f"{date_str} {hour:02d}:00:00", "%Y-%m-%d %H:%M:%S")
        obs_dt = obs_dt.replace(tzinfo=timezone.utc)
        observation_time = obs_dt.isoformat()

        # Generate filename: YYYYMMDDHHMM_skewt_STATION.png
        filename = f"{date_str.replace('-', '')}{hour:02d}00_skewt_{station}.png"

        item = ImageItem()
        item["name"] = filename
        item["parent_url"] = response.url
        item["page_title"] = self._clean_text(response.xpath("//title/text()").get())
        item["source_modified"] = None  # Will be set from HTTP headers
        item["observation_time"] = observation_time
        item["fetched_at"] = datetime.now(timezone.utc).isoformat()
        item["image_urls"] = [image_url]
        item["etag"] = None
        item["raw_metadata"] = {
            "station_id": station,
            "sounding_hour": hour,
            "sounding_date": date_str,
            "original_image_url": image_url,
        }

        # Make HEAD request to get HTTP headers (ETag, Last-Modified, etc.)
        yield scrapy.Request(
            image_url,
            method="HEAD",
            callback=self.parse_headers,
            errback=self.handle_error,
            meta={"item": item},
            dont_filter=True,
        )
