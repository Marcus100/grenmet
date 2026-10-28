import re
from pathlib import Path

from src.sectors import SECTOR_KEYS, SECTORS, parse_sectors, unknown_sectors

SECTORS_TS = (
    Path(__file__).resolve().parents[4] / "packages" / "gms" / "src" / "sectors.ts"
)
ENTRY = re.compile(r'\{ value: "([^"]+)", label: "([^"]+)" \}')


def test_the_list_matches_the_weather_site_package() -> None:
    assert tuple(ENTRY.findall(SECTORS_TS.read_text())) == SECTORS


def test_parse_keeps_menu_order_and_drops_unknown_names() -> None:
    assert parse_sectors(" health , marine,marine, nonsense") == ["marine", "health"]
    assert parse_sectors("") == []
    assert parse_sectors(None) == []
    assert parse_sectors(",".join(reversed(SECTOR_KEYS))) == list(SECTOR_KEYS)


def test_unknown_names_are_reported_once() -> None:
    assert unknown_sectors("marine, boats, boats, health, sky") == ["boats", "sky"]
    assert unknown_sectors("marine") == []
    assert unknown_sectors(None) == []
