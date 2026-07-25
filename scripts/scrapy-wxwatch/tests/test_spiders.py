from types import SimpleNamespace

from scrapy.http import HtmlResponse, Request

from app.spiders.trackthetropics import TrackTheTropicsSpider


class InMemoryStats:
    def __init__(self):
        self.values = {}

    def set_value(self, key, value):
        self.values[key] = value


def test_trackthetropics_reports_every_eligible_live_page_product():
    spider = TrackTheTropicsSpider()
    stats = InMemoryStats()
    spider.crawler = SimpleNamespace(stats=stats)
    url = "https://www.trackthetropics.com/"
    response = HtmlResponse(
        url=url,
        request=Request(url),
        encoding="utf-8",
        body=b"""
            <html><body>
              <img src="/weather/current.png">
              <img src="https://www.nhc.noaa.gov/outlook.png">
              <img src="https://cdn.star.nesdis.noaa.gov/excluded.jpg">
              <img src="/white_logo.svg">
            </body></html>
        """,
    )

    requests = list(spider.parse(response))

    assert len(requests) == 2
    assert stats.values["wxwatch/expected_images"] == 2
