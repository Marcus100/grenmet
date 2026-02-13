from datetime import datetime, timezone, timedelta

from app.items import ImageItem
from app.spiders.base import WeatherSpider


class SfcanaSpider(WeatherSpider):
    name = "sfcana"
    allowed_domains = ["ocean.weather.gov"]
    start_urls = ["https://ocean.weather.gov/UA/"]

    target_filename = "Atl_Tropics.gif"

    def parse(self, response):
        row = response.xpath(f"//tr[td/a[text()='{self.target_filename}']]")
        if not row:
            self.logger.warning("Target file %s not found on %s", self.target_filename, response.url)
            return

        image_url = response.urljoin(row.xpath(".//a/@href").get())
        last_modified_raw = self._clean_text(row.xpath("./td[2]/text()").get())
        size_text = self._clean_text(row.xpath("./td[3]/text()").get())

        # For sfcana, observation time is ~3-4 hours before source modification
        # Subtract 3 hours, then round down to nearest 3-hour synoptic time (00, 03, 06, 09, 12, 15, 18, 21z)
        source_modified = self._parse_datetime_iso(last_modified_raw)
        
        # Subtract 3 hours from source_modified to get approximate observation time
        if source_modified:
            try:
                dt = datetime.fromisoformat(source_modified.replace("Z", "+00:00"))
                dt_minus_3h = dt - timedelta(hours=3)
                observation_time_approx = dt_minus_3h.isoformat()
            except (ValueError, TypeError):
                observation_time_approx = source_modified
        else:
            observation_time_approx = source_modified

        item = ImageItem()
        item["name"] = row.xpath(".//a/text()").get()
        item["parent_url"] = response.url
        item["page_title"] = self._clean_text(response.xpath("//title/text()").get())
        item["source_modified"] = source_modified
        item["observation_time"] = self._round_to_synoptic(observation_time_approx)
        item["fetched_at"] = datetime.now(timezone.utc).isoformat()
        item["image_urls"] = [image_url]
        item["etag"] = None
        item["raw_metadata"] = {
            "directory_path": response.url.rstrip("/"),
            "last_modified_raw": last_modified_raw,
            "size_text": size_text,
            "size_bytes": self._parse_size(size_text),
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
