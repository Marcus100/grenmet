from datetime import datetime, timezone

from app.items import ImageItem
from app.spiders.base import WeatherSpider


class CimssSpider(WeatherSpider):
    name = "cimss"
    allowed_domains = ["tropic.ssec.wisc.edu"]
    custom_settings = {
        "ROBOTSTXT_OBEY": False,
    }

    start_urls = [
        "https://tropic.ssec.wisc.edu/real-time/sal/g16split/",
        "https://tropic.ssec.wisc.edu/real-time/wavetrak/domains/",
        "https://tropic.ssec.wisc.edu/real-time/atlantic/winds/",
    ]

    # Map each directory URL to its target filenames
    target_files = {
        "https://tropic.ssec.wisc.edu/real-time/sal/g16split/": [
            "g16split.jpg",
        ],
        "https://tropic.ssec.wisc.edu/real-time/wavetrak/domains/": [
            "windNWATL.gif",
        ],
        "https://tropic.ssec.wisc.edu/real-time/atlantic/winds/": [
            "wg8dlm6.GIF",
            "wg8dlm5.GIF",
            "wg8dlm4.GIF",
            "wg8dlm3.GIF",
            "wg8dlm2.GIF",
            "wg8dlm1.GIF",
            "wg8conv.GIF",
            "wg8sht.GIF",
            "wg8shr.GIF",
            "wg8midshr.GIF",
            "wg8ir.GIF",
            "wg8dvg.GIF",
            "wg8vor5.GIF",
            "wg8vor4.GIF",
            "wg8vor3.GIF",
            "wg8vor2.GIF",
            "wg8vor1.GIF",
            "wg8vor.GIF",
            "wg8wxc.GIF",
            "wg8wvir.GIF",
        ],
    }

    def parse(self, response):
        # Get target files for this directory
        targets = self.target_files.get(response.url, [])
        if not targets:
            self.logger.warning("No target files configured for %s", response.url)
            return

        # Convert to set for fast lookup (case-insensitive)
        target_set = {f.lower() for f in targets}

        # Parse Apache table-based directory listing
        # Each row has: icon, filename link, last modified, size, description
        rows = response.xpath("//tr[td/a]")

        found_count = 0
        for row in rows:
            filename = row.xpath(".//td[2]/a/text()").get()
            if not filename:
                continue

            # Case-insensitive match
            if filename.lower() not in target_set:
                continue

            found_count += 1
            image_url = response.urljoin(row.xpath(".//td[2]/a/@href").get())
            last_modified_raw = self._clean_text(row.xpath(".//td[3]/text()").get())
            size_text = self._clean_text(row.xpath(".//td[4]/text()").get())

            # For CIMSS, observation time is ~45 min before source modification
            # Round down to nearest hour to get approximate observation time
            source_modified = self._parse_datetime_iso(last_modified_raw)

            item = ImageItem()
            item["name"] = filename
            item["parent_url"] = response.url
            item["page_title"] = self._clean_text(response.xpath("//title/text()").get())
            item["source_modified"] = source_modified
            item["observation_time"] = self._round_to_hour(source_modified)
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

        if found_count == 0:
            self.logger.warning(
                "No target files found in %s (expected %d)", response.url, len(targets)
            )
        elif found_count < len(targets):
            self.logger.warning(
                "Only found %d of %d target files in %s",
                found_count,
                len(targets),
                response.url,
            )
