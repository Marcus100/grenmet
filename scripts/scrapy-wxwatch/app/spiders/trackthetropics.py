from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import urlparse

from app.items import ImageItem
from app.spiders.base import WeatherSpider


class TrackTheTropicsSpider(WeatherSpider):
    name = "trackthetropics"

    # Override global settings for this spider
    custom_settings = {
        "ROBOTSTXT_OBEY": False,  # Required for cdn.star.nesdis.noaa.gov GOES images
    }

    allowed_domains = [
        "trackthetropics.com",
        "www.trackthetropics.com",
        "donorbox.org",
        "nhc.noaa.gov",
        "www.nhc.noaa.gov",
        "cdn.star.nesdis.noaa.gov",
        "cyclonicwx.com",
        "www.ospo.noaa.gov",
        "tropic.ssec.wisc.edu",
        "cimss.ssec.wisc.edu",
        "s.w-x.co",
        "ocean.weather.gov",
        "www.emc.ncep.noaa.gov",
        "www.oceanweather.com",
        "www.cpc.ncep.noaa.gov",
        "www.wpc.ncep.noaa.gov",
        "www.metoc.navy.mil",
        "www.myfoxhurricane.com",
        "manati.star.nesdis.noaa.gov",
        "iri.columbia.edu",
        "media.raven.news",
    ]
    start_urls = ["https://www.trackthetropics.com/"]

    # Domains handled by dedicated spiders - skip to avoid duplicates
    excluded_domains = {
        "cdn.star.nesdis.noaa.gov",  # goes19 spider
        "tropic.ssec.wisc.edu",      # cimss spider
        "cimss.ssec.wisc.edu",       # cimss spider
        "ocean.weather.gov",         # sfcana spider
    }

    # URL patterns to skip (no download, no JSON)
    blocked_patterns = [
        "white_logo.svg",
        "5dayfcst_wbg_conus.gif",
        "222953_5day_cone_with_line_and_wind.png",
        "2025-Hurricane-Season-Names.jpg",
        "GOES16-GA-08-1000x1000.gif",
        "GOES16-GA-02-1000x1000.gif",
        "GOES16-GA-13-1000x1000.gif",
        "GOES16-GA-GEOCOLOR-1000x1000.gif",
        "animate.png",
        "atl_anom.gif",
        "Atlantic_Storm_Count.jpg",
        "AtlanticCampfire_sm.png",
        "august.gif",
        "conus_strikes_sm.jpg",
        "ensoapril2025.png",
        "tws_atl_latest.gif",
        "FB_IMG_1663177721468.jpg",
        "figure1.png",
        "fill_94qwbg.gif",
        "gl_rCUMP_048.png",
        "gl_rTCFP_024.png",
        "gth_full_TCOnly_ATL.png",
        "gth_full.png",
        "GULF_latest.gif",
        "gulfmex.fc.gif",
        "july.gif",
        "june.gif",
        "map-300x174.png",
        "namsesfcwbg.gif",
        "natlanti.fc.gif",
        "noaad1.gif",
        "noaad2.gif",
        "noaad3.gif",
        "november.gif",
        "october.gif",
        "p120i.gif",
        "p168i.gif",
        "return_hurr_sm.jpg",
        "return_mjrhurr_sm.jpg",
        "september.gif",
        "strikes_egulf_mjr_sm.jpg",
        "strikes_egulf_sm.jpg",
        "strikes_ne_mjr_sm.jpg",
        "strikes_ne_sm.jpg",
        "strikes_se_mjr_sm.jpg",
        "strikes_se_sm.jpg",
        "strikes_us_mjr_sm.jpg",
        "strikes_us_sm.jpg",
        "strikes_wgulf_mjr_sm.jpg",
        "strikes_wgulf_sm.jpg",
        "thumbnail.png",
        "TrackTheTropics-square-logo-785x520.png",
        "two_atl_2d0.png",
        "two_atl_7d0.png",
        "tws_atl_latest.gif",
        "upside.png",
        "whole_as.png",
        "whole_ds.png",
        # Dynamic/ephemeral images that often 404
        "98L_tracks.png",           # Only exists during active invest
        "98L/imagery/rbtop",        # Tropical floater imagery (OSPO)
        "genprob.aeperts",          # Genesis probability (date-dependent)
        "genprob.4enscon",          # Ensemble consensus (date-dependent)
        # Blocked by server (403)
        "000hr_AOR_00Z.jpg",        # Navy METOC - blocks bot requests
    ]

    def parse(self, response):
        seen = set()

        for src in response.xpath("//img/@src").getall():
            if not src:
                continue

            image_url = response.urljoin(src.strip())

            # Normalize http:// to https:// for domains that support it
            if image_url.startswith("http://"):
                image_url = "https://" + image_url[7:]

            if image_url in seen:
                continue

            seen.add(image_url)

            parsed = urlparse(image_url)

            # Skip images from domains handled by dedicated spiders
            if parsed.netloc in self.excluded_domains:
                continue

            # Skip URLs matching blocked patterns
            if any(pattern in image_url for pattern in self.blocked_patterns):
                continue

            name = (PurePosixPath(parsed.path).name or "image").lower()

            item = ImageItem()
            item["name"] = name
            item["parent_url"] = response.url
            item["page_title"] = self._clean_text(response.xpath("//title/text()").get())
            item["fetched_at"] = datetime.now(timezone.utc).isoformat()
            item["image_urls"] = [image_url]
            item["etag"] = None
            item["raw_metadata"] = {}

            # Do HEAD request to get Last-Modified header for source_modified
            request = response.follow(
                image_url,
                method="HEAD",
                callback=self.parse_headers,
                errback=self.handle_error,
                meta={"item": item},
                dont_filter=True,
            )
            yield request
