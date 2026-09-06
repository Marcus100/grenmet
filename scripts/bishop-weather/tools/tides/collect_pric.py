#!/usr/bin/env python3
"""Collect authoritative source artifacts for the Prickly Bay tide gauge.

Every run creates a new immutable snapshot directory. Source bytes are never
rewritten in place; a SHA-256 manifest records what was retrieved and when.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_ROOT = (
    REPOSITORY_ROOT
    / "raw"
    / "02-atmosphere-aviation"
    / "datasets"
    / "tide-gauges"
    / "pric"
    / "snapshots"
)
USER_AGENT = "GMS-PRIC-data-archive/0.1 (authoritative-source preservation)"


@dataclass(frozen=True)
class Source:
    source_id: str
    authority: str
    release_class: str
    role: str
    url: str
    relative_path: str
    notes: str
    requires_ioc_api_key: bool = False


SOURCES: tuple[Source, ...] = (
    Source(
        "uhslc-rq-hourly-csv",
        "University of Hawaii Sea Level Center",
        "quality-controlled research",
        "primary model-training observations",
        "https://uhslc.soest.hawaii.edu/data/csv/rqds/atlantic/hourly/h789a.csv",
        "uhslc/rq/hourly/h789a.csv",
        "UTC hourly values in millimetres relative to the UHSLC station datum.",
    ),
    Source(
        "uhslc-rq-daily-csv",
        "University of Hawaii Sea Level Center",
        "quality-controlled research",
        "long-period audit and mean sea-level analysis",
        "https://uhslc.soest.hawaii.edu/data/csv/rqds/atlantic/daily/d789a.csv",
        "uhslc/rq/daily/d789a.csv",
        "Daily values; not a substitute for hourly data in harmonic analysis.",
    ),
    Source(
        "uhslc-rq-hourly-netcdf",
        "University of Hawaii Sea Level Center",
        "quality-controlled research",
        "self-describing primary model-training observations",
        "https://uhslc.soest.hawaii.edu/data/netcdf/rqds/atlantic/hourly/h789a.nc",
        "uhslc/rq/hourly/h789a.nc",
        "NetCDF counterpart to the hourly RQ CSV.",
    ),
    Source(
        "uhslc-rq-daily-netcdf",
        "University of Hawaii Sea Level Center",
        "quality-controlled research",
        "self-describing long-period audit data",
        "https://uhslc.soest.hawaii.edu/data/netcdf/rqds/atlantic/daily/d789a.nc",
        "uhslc/rq/daily/d789a.nc",
        "NetCDF counterpart to the daily RQ CSV.",
    ),
    Source(
        "uhslc-fast-hourly-csv",
        "University of Hawaii Sea Level Center",
        "fast-delivery provisional",
        "provisional extension after the RQ cutoff",
        "https://uhslc.soest.hawaii.edu/data/csv/fast/hourly/h789.csv",
        "uhslc/fast/hourly/h789.csv",
        "Keep separate from RQ data until quality control is released.",
    ),
    Source(
        "uhslc-fast-daily-csv",
        "University of Hawaii Sea Level Center",
        "fast-delivery provisional",
        "provisional daily extension",
        "https://uhslc.soest.hawaii.edu/data/csv/fast/daily/d789.csv",
        "uhslc/fast/daily/d789.csv",
        "Keep separate from RQ data until quality control is released.",
    ),
    Source(
        "uhslc-fast-hourly-netcdf",
        "University of Hawaii Sea Level Center",
        "fast-delivery provisional",
        "self-describing provisional extension",
        "https://uhslc.soest.hawaii.edu/data/netcdf/fast/hourly/h789.nc",
        "uhslc/fast/hourly/h789.nc",
        "NetCDF counterpart to the hourly fast-delivery CSV.",
    ),
    Source(
        "uhslc-fast-daily-netcdf",
        "University of Hawaii Sea Level Center",
        "fast-delivery provisional",
        "self-describing provisional daily extension",
        "https://uhslc.soest.hawaii.edu/data/netcdf/fast/daily/d789.nc",
        "uhslc/fast/daily/d789.nc",
        "NetCDF counterpart to the daily fast-delivery CSV.",
    ),
    Source(
        "uhslc-quality-document",
        "University of Hawaii Sea Level Center",
        "station quality metadata",
        "sensor history, adjustments, completeness, and datum documentation",
        "https://uhslc.soest.hawaii.edu/rqds/atlantic/doc/qa789a.dmt",
        "uhslc/metadata/qa789a.dmt",
        "Quality document currently describes the RQ processing through 2018.",
    ),
    Source(
        "uhslc-station-catalogue",
        "University of Hawaii Sea Level Center",
        "current station metadata",
        "coordinates, identifiers, and catalogue coverage",
        "https://uhslc.soest.hawaii.edu/data/meta.geojson",
        "uhslc/metadata/meta.geojson",
        "Global catalogue; filter station_id=789 during audit.",
    ),
    Source(
        "uhslc-legacy-hourly",
        "University of Hawaii Sea Level Center",
        "legacy distribution",
        "format and value cross-check",
        "https://uhslc.soest.hawaii.edu/woce/h789.dat",
        "uhslc/legacy/h789.dat",
        "Legacy hourly distribution retained only as an independent packaging check.",
    ),
    Source(
        "uhslc-prediction-july-2026",
        "University of Hawaii Sea Level Center",
        "published research tide calendar",
        "independent July 2026 high/low event comparison",
        "https://uhslc.soest.hawaii.edu/stations/TIDES_DATUMS/fd/LST/fd789/t789_202607_m.txt",
        "uhslc/predictions/t789_202607_m.txt",
        "LST is AST (UTC-4); heights are relative to UHSLC MLLW 0.37 m.",
    ),
    Source(
        "uhslc-prediction-august-2026",
        "University of Hawaii Sea Level Center",
        "published research tide calendar",
        "independent August 2026 high/low event comparison",
        "https://uhslc.soest.hawaii.edu/stations/TIDES_DATUMS/fd/LST/fd789/t789_202608_m.txt",
        "uhslc/predictions/t789_202608_m.txt",
        "LST is AST (UTC-4); heights are relative to UHSLC MLLW 0.37 m.",
    ),
    Source(
        "psmsl-station-page",
        "Permanent Service for Mean Sea Level",
        "datum and station metadata",
        "station identity and PSMSL coverage",
        "https://psmsl.org/data/obtaining/stations/2272.php",
        "psmsl/metadata/station-2272.html",
        "PSMSL station 2272; old identifier 893/001.",
    ),
    Source(
        "psmsl-rlr-diagram-page",
        "Permanent Service for Mean Sea Level",
        "datum and benchmark metadata",
        "RLR-to-benchmark relationship",
        "https://psmsl.org/data/obtaining/rlr.diagrams/2272.php",
        "psmsl/metadata/rlr-diagram-2272.html",
        "Documents the RLR datum relationship; preserve linked diagram separately if needed.",
    ),
    Source(
        "psmsl-rlr-monthly",
        "Permanent Service for Mean Sea Level",
        "quality-controlled monthly",
        "datum and monthly mean cross-check",
        "https://psmsl.org/data/obtaining/rlr.monthly.data/2272.rlrdata",
        "psmsl/rlr/monthly/2272.rlrdata",
        "Millimetres relative to Revised Local Reference.",
    ),
    Source(
        "psmsl-rlr-annual",
        "Permanent Service for Mean Sea Level",
        "quality-controlled annual",
        "long-period mean sea-level cross-check",
        "https://psmsl.org/data/obtaining/rlr.annual.data/2272.rlrdata",
        "psmsl/rlr/annual/2272.rlrdata",
        "Millimetres relative to Revised Local Reference.",
    ),
    Source(
        "psmsl-metric-monthly",
        "Permanent Service for Mean Sea Level",
        "quality-controlled monthly",
        "source-datum monthly mean cross-check",
        "https://psmsl.org/data/obtaining/met.monthly.data/2272.metdata",
        "psmsl/metric/monthly/2272.metdata",
        "Millimetres relative to the submitting authority's source datum.",
    ),
    Source(
        "psmsl-cme-hourly",
        "PSMSL Caribbean Sea-level Monitoring and NOC",
        "experimental automatically quality-controlled",
        "sensor-level comparison and anomaly diagnosis",
        "https://psmsl.org/cme/tideGaugeData/zip/hourly/pric_hourly.zip",
        "psmsl/cme/hourly/pric_hourly.zip",
        "Experimental auto-QC; do not replace UHSLC RQ training data.",
    ),
    Source(
        "psmsl-cme-download-page",
        "PSMSL Caribbean Sea-level Monitoring and NOC",
        "service documentation",
        "file formats, sensor codes, flags, and datum caveats",
        "https://psmsl.org/cme/downloaddata.php",
        "psmsl/cme/metadata/download-data.html",
        "Documents the experimental automatic QC and original-frequency archive.",
    ),
    Source(
        "psmsl-cme-daily",
        "PSMSL Caribbean Sea-level Monitoring and NOC",
        "experimental automatically quality-controlled",
        "sensor-level comparison and daily anomaly diagnosis",
        "https://psmsl.org/cme/tideGaugeData/zip/daily/pric_daily.zip",
        "psmsl/cme/daily/pric_daily.zip",
        "Experimental auto-QC; do not replace UHSLC RQ training data.",
    ),
    Source(
        "noc-cme-quality-report",
        "National Oceanography Centre",
        "scientific quality assessment",
        "known timing and sensor discrepancies",
        "https://projects.noc.ac.uk/cme-programme/sites/cme-programme/files/documents/reports/Williams_et_al_NOC_R%26C_64_2019.pdf",
        "noc/reports/Williams_et_al_NOC_RC_64_2019.pdf",
        "Regional quality-control report; historical findings require current verification.",
    ),
    Source(
        "ioc-station-page",
        "IOC Sea Level Station Monitoring Facility",
        "current station metadata",
        "operational status and current sensors",
        "https://www.ioc-sealevelmonitoring.org/station.php?code=pric",
        "ioc/metadata/station-pric.html",
        "IOC station code pric.",
    ),
    Source(
        "ioc-ssc-station-details",
        "IOC Sea Level Station Monitoring Facility",
        "current station metadata",
        "platform identifiers, coordinates, operator, and telemetry",
        "https://www.ioc-sealevelmonitoring.org/ssc/stationdetails.php?id=SSC-pric",
        "ioc/metadata/ssc-pric.html",
        "Sea Level Station Catalogue identifier SSC-pric.",
    ),
    Source(
        "ioc-service-description",
        "Intergovernmental Oceanographic Commission",
        "service documentation",
        "data caveats and service purpose",
        "https://www.ioc-sealevelmonitoring.org/service.php",
        "ioc/metadata/service.html",
        "Preserves the service's own qualification of real-time data.",
    ),
    Source(
        "ioc-api-openapi",
        "IOC Sea Level Station Monitoring Facility",
        "API contract",
        "machine-readable acquisition interface and field definitions",
        "https://api.ioc-sealevelmonitoring.org/v2/doc/json",
        "ioc/api/openapi.json",
        "API contract is public; observation endpoints require an API key.",
    ),
    Source(
        "ioc-live-half-day",
        "IOC Sea Level Station Monitoring Facility",
        "raw near-real-time",
        "current sensor diagnostics only",
        "https://www.ioc-sealevelmonitoring.org/bgraph.php?code=pric&output=tab&period=0.5",
        "ioc/live/pric-half-day.tsv",
        "Unverified telemetry snapshot; never use as quality-controlled training truth.",
    ),
    Source(
        "ioc-live-30-day",
        "IOC Sea Level Station Monitoring Facility",
        "raw near-real-time",
        "provisional July 2026 radar and bubbler timing verification",
        "https://www.ioc-sealevelmonitoring.org/bgraph.php?code=pric&output=tab&period=30",
        "ioc/live/pric-30-day.html",
        "Unverified telemetry; preserve sensor channels and exclude anomalous pressure.",
    ),
    Source(
        "psmsl-rlr-diagram-image",
        "Permanent Service for Mean Sea Level",
        "datum and benchmark metadata",
        "human-verifiable RLR-to-benchmark diagram",
        "https://psmsl.org/data/obtaining/rlr.diagrams/images/2272.png",
        "psmsl/metadata/rlr-diagram-2272.png",
        "Image referenced by the PSMSL station's RLR diagram page.",
    ),
)


# PSMSL/NOC publishes original-frequency, sensor-specific annual archives for
# 2011-2018. Availability was enumerated against the documented archive on
# 2026-07-26. These data are diagnostic/experimental, not a replacement for RQ.
SOURCES += tuple(
    Source(
        source_id=f"psmsl-cme-hf-{sensor}-{year}",
        authority="PSMSL Caribbean Sea-level Monitoring and NOC",
        release_class="experimental automatically quality-controlled",
        role="original-frequency sensor diagnostics and high/low timing analysis",
        url=(
            "https://psmsl.org/cme/tideGaugeData/zip/hf/"
            f"pric_{sensor}_{year}.zip"
        ),
        relative_path=f"psmsl/cme/original-frequency/{sensor}/pric_{sensor}_{year}.zip",
        notes=(
            "One year from one sensor. Flag 1 is good and flag 4 is flagged; "
            "sensor datums may differ or drift."
        ),
    )
    for year in range(2011, 2019)
    for sensor in ("rad", "prs", "bub", "combined")
)


SOURCES += (
    Source(
        "model-input-doc-era5",
        "ECMWF Copernicus Climate Change Service",
        "authoritative dataset documentation",
        "meteorological and wave covariate definition",
        "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview",
        "model-inputs/metadata/era5-single-levels.html",
        "For a later non-tidal residual model; data retrieval requires CDS access.",
    ),
    Source(
        "model-input-doc-glorys",
        "Copernicus Marine Service",
        "authoritative dataset documentation",
        "regional ocean-state covariate definition",
        "https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description",
        "model-inputs/metadata/glorys12v1.html",
        "For a later non-tidal residual model; data retrieval requires Copernicus access.",
    ),
    Source(
        "model-input-doc-ibtracs",
        "NOAA National Centers for Environmental Information",
        "authoritative dataset documentation",
        "tropical-cyclone event and regime definition",
        "https://www.ncei.noaa.gov/products/international-best-track-archive",
        "model-inputs/metadata/ibtracs.html",
        "IBTrACS is used for event labelling and validation splits, not direct tide fitting.",
    ),
    Source(
        "model-input-ibtracs-na-csv",
        "NOAA National Centers for Environmental Information",
        "official current archive",
        "North Atlantic tropical-cyclone tracks and intensity",
        "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NA.list.v04r01.csv",
        "model-inputs/ibtracs/ibtracs.NA.list.v04r01.csv",
        "Used only for storm-regime labelling and event-based residual validation.",
    ),
    Source(
        "model-input-doc-gebco",
        "General Bathymetric Chart of the Oceans",
        "authoritative dataset documentation",
        "regional bathymetric context",
        "https://www.gebco.net/data-products/gridded-bathymetry-data",
        "model-inputs/metadata/gebco-grid.html",
        "A subset is optional context, not required for a single-station harmonic fit.",
    ),
    Source(
        "model-input-doc-tpxo",
        "Oregon State University",
        "authoritative model documentation",
        "independent global tidal constituent comparator",
        "https://www.tpxo.net/global",
        "model-inputs/metadata/tpxo-global.html",
        "TPXO global data requires registration; preserve the exact licensed release.",
    ),
    Source(
        "model-input-doc-uhslc-station-explorer",
        "University of Hawaii Sea Level Center",
        "authoritative method and comparator",
        "UTide-derived station prediction",
        "https://uhslc.soest.hawaii.edu/stations/?stn=789",
        "model-inputs/metadata/uhslc-station-explorer-789.html",
        "Independent implementation comparison, not independent observational truth.",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help="Parent of timestamped snapshot directories.",
    )
    parser.add_argument(
        "--snapshot-id",
        help="Snapshot directory name; defaults to retrieval time in UTC.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Download only the named source_id; may be repeated.",
    )
    parser.add_argument(
        "--only-prefix",
        action="append",
        default=[],
        help="Download source IDs beginning with this prefix; may be repeated.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List source IDs and exit.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when any source fails.",
    )
    parser.add_argument(
        "--direct",
        action="store_true",
        help="Ignore proxy environment variables and connect directly.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=90.0,
        help="Per-request timeout in seconds.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retries after the first attempt.",
    )
    return parser.parse_args()


def make_opener(direct: bool) -> urllib.request.OpenerDirector:
    handlers: list[urllib.request.BaseHandler] = []
    if direct:
        handlers.append(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener(*handlers)


def selected_sources(
    only: Iterable[str], only_prefix: Iterable[str] = ()
) -> tuple[Source, ...]:
    requested = set(only)
    prefixes = tuple(only_prefix)
    if not requested and not prefixes:
        return SOURCES
    known = {source.source_id for source in SOURCES}
    unknown = sorted(requested - known)
    if unknown:
        raise SystemExit(f"Unknown source IDs: {', '.join(unknown)}")
    return tuple(
        source
        for source in SOURCES
        if source.source_id in requested
        or any(source.source_id.startswith(prefix) for prefix in prefixes)
    )


def download(
    opener: urllib.request.OpenerDirector,
    source: Source,
    destination: Path,
    timeout: float,
    retries: int,
) -> dict[str, object]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    if destination.exists() or temporary.exists():
        raise FileExistsError(f"Refusing to overwrite {destination}")

    request = urllib.request.Request(source.url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            digest = hashlib.sha256()
            byte_count = 0
            started = datetime.now(UTC)
            with opener.open(request, timeout=timeout) as response, temporary.open(
                "xb"
            ) as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    digest.update(chunk)
                    byte_count += len(chunk)
                headers = {
                    key.lower(): value
                    for key, value in response.headers.items()
                    if key.lower()
                    in {
                        "content-type",
                        "content-length",
                        "etag",
                        "last-modified",
                        "date",
                    }
                }
                status = getattr(response, "status", None)
                final_url = response.geturl()
            shutil.move(str(temporary), str(destination))
            return {
                **asdict(source),
                "status": "downloaded",
                "http_status": status,
                "final_url": final_url,
                "retrieval_started_utc": started.isoformat(),
                "retrieval_completed_utc": datetime.now(UTC).isoformat(),
                "response_headers": headers,
                "bytes": byte_count,
                "sha256": digest.hexdigest(),
            }
        except Exception as error:  # manifest must retain all retrieval failures
            last_error = error
            temporary.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(min(2**attempt, 4))
    assert last_error is not None
    return {
        **asdict(source),
        "status": "failed",
        "retrieval_completed_utc": datetime.now(UTC).isoformat(),
        "error_type": type(last_error).__name__,
        "error": str(last_error),
    }


def main() -> int:
    args = parse_args()
    if args.list:
        for source in SOURCES:
            print(f"{source.source_id:30} {source.release_class}")
        return 0

    snapshot_id = args.snapshot_id or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    snapshot_dir = args.output_root.resolve() / snapshot_id
    snapshot_dir.mkdir(parents=True, exist_ok=False)
    opener = make_opener(args.direct)
    sources = selected_sources(args.only, args.only_prefix)

    records: list[dict[str, object]] = []
    for index, source in enumerate(sources, 1):
        print(f"[{index:02}/{len(sources):02}] {source.source_id}", flush=True)
        destination = snapshot_dir / source.relative_path
        record = download(opener, source, destination, args.timeout, args.retries)
        records.append(record)
        print(
            f"  {record['status']}"
            + (
                f" ({record['bytes']} bytes, {str(record['sha256'])[:12]}…)"
                if record["status"] == "downloaded"
                else f": {record['error']}"
            ),
            flush=True,
        )

    completed = datetime.now(UTC)
    manifest = {
        "schema_version": "1.0",
        "station": {
            "name": "Prickly Bay",
            "country": "Grenada",
            "ioc_code": "pric",
            "ssc_id": "SSC-pric",
            "uhslc_station_id": "789",
            "uhslc_rq_record": "789A",
            "psmsl_station_id": "2272",
        },
        "snapshot_id": snapshot_id,
        "completed_utc": completed.isoformat(),
        "collector": str(Path(__file__).relative_to(REPOSITORY_ROOT)),
        "python": sys.version,
        "direct_connection": args.direct,
        "records": records,
        "summary": {
            "requested": len(records),
            "downloaded": sum(r["status"] == "downloaded" for r in records),
            "failed": sum(r["status"] == "failed" for r in records),
            "bytes": sum(int(r.get("bytes", 0)) for r in records),
        },
    }
    manifest_path = snapshot_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"Manifest: {manifest_path}")
    return 1 if args.strict and manifest["summary"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
