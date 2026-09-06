import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import cast

from sutron_collector.collector import Collector
from sutron_collector.models import CollectedBatch
from sutron_collector.surface_export import render_surface_csv, surface_filename
from sutron_collector.transport import SerialSettings, SerialTransport

DEFAULT_STATION_NAME = "MAURICEBISHOPINTL"
DEFAULT_STATION_ID = 13000
# SURFACE Station.code, confirmed against the running instance 2026-08-15:
# "MAURICE BISHOP INTL AIRPORT". 78958 is the WMO index number for Point
# Salines, so it is also the basis of the station's WIGOS identifier.
DEFAULT_STATION_CODE = "78958"


class FixtureTransport:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload

    def query(self, command: bytes) -> bytes:
        del command
        return self.payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Collect tagged observations from a Sutron weather station"
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    fixture = subcommands.add_parser(
        "fixture", help="parse a saved logger response without hardware"
    )
    fixture.add_argument("path", help="path to a captured logger response")
    _add_station_arguments(fixture)

    poll = subcommands.add_parser("poll", help="query a logger through a serial port")
    poll.add_argument("--port", default="/dev/ttyS1")
    poll.add_argument("--baudrate", type=int, default=9600)
    poll.add_argument("--timeout", type=float, default=5.0)
    poll.add_argument("--max-bytes", type=int, default=5000)
    poll.add_argument("--attempts", type=int, default=3)
    _add_station_arguments(poll)

    return parser


def _add_station_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--station-name", default=DEFAULT_STATION_NAME)
    parser.add_argument("--station-id", type=int, default=DEFAULT_STATION_ID)
    parser.add_argument(
        "--format",
        choices=("json", "surface"),
        default="json",
        help="json to inspect a reading, surface for SURFACE CSV ingestion",
    )
    parser.add_argument(
        "--station-code",
        default=DEFAULT_STATION_CODE,
        help="SURFACE Station.code; becomes surface_<code>.csv",
    )
    parser.add_argument(
        "--output-dir",
        help="write the reading to a file here instead of standard output",
    )


def _batch_payload(batch: CollectedBatch) -> dict[str, object]:
    return {
        "station_name": batch.station_name,
        "station_id": batch.station_id,
        "collected_at": batch.collected_at.isoformat(),
        "observations": [
            {
                "tag": observation.tag,
                "value": str(observation.value),
                "status_tokens": list(observation.status_tokens),
                "raw_line": observation.raw_line,
            }
            for observation in batch.observations
        ],
    }


def _render(batch: CollectedBatch, output_format: str) -> str:
    if output_format == "surface":
        return render_surface_csv([batch])
    return json.dumps(_batch_payload(batch), indent=2) + "\n"


def _write_batch(
    batch: CollectedBatch,
    output_format: str = "json",
    *,
    station_code: str = DEFAULT_STATION_CODE,
    output_dir: str | None = None,
) -> None:
    """Print the reading, or write it to a file for SURFACE to ingest.

    The file is written to a temporary name and then renamed. A rename is
    atomic on the same filesystem, so an ingester watching the directory can
    never pick up a half-written file -- the same reason the legacy CIMH
    upload wrote to a temporary name before renaming.
    """
    payload = _render(batch, output_format)

    if output_dir is None:
        sys.stdout.write(payload)
        return

    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    if output_format == "surface":
        target = directory / surface_filename(
            station_code, at=batch.collected_at
        )
    else:
        target = directory / f"{station_code}_{batch.collected_at:%Y%m%d_%H%M}.json"

    pending = target.with_name(target.name + ".partial")
    pending.write_text(payload, encoding="utf-8")
    pending.replace(target)

    sys.stdout.write(f"wrote {target}\n")


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    command = cast(str, arguments.command)
    station_name = cast(str, arguments.station_name)
    station_id = cast(int, arguments.station_id)

    if command == "fixture":
        path = Path(cast(str, arguments.path))
        collector = Collector(
            transport=FixtureTransport(path.read_bytes()),
            station_name=station_name,
            station_id=station_id,
            attempts=1,
        )
    else:
        settings = SerialSettings(
            port=cast(str, arguments.port),
            baudrate=cast(int, arguments.baudrate),
            timeout=cast(float, arguments.timeout),
            max_bytes=cast(int, arguments.max_bytes),
        )
        collector = Collector(
            transport=SerialTransport(settings),
            station_name=station_name,
            station_id=station_id,
            attempts=cast(int, arguments.attempts),
        )

    _write_batch(
        collector.collect_once(),
        cast(str, arguments.format),
        station_code=cast(str, arguments.station_code),
        output_dir=cast("str | None", arguments.output_dir),
    )
    return 0
