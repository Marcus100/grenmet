"""One bounded pass: find new receiver files, render, store, register."""

import json
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from gnc_collector.archive import SOURCE, ArchiveClient, Storage, sha256
from gnc_collector.goes import CARIBBEAN, Area, ScanFile, parse_name
from gnc_collector.render import BANDS, render

# FAZZT writes files in place; anything this fresh may still be growing.
SETTLE_SECONDS = 60
STATE_FILE = "processed.json"
STATE_LIMIT = 5000


def discover(
    input_dir: Path,
    bands: Iterable[int],
    satellite: int = 19,
    now: float | None = None,
) -> list[ScanFile]:
    """Settled full-disk CMIP files for the bands, newest first."""
    wanted = set(bands)
    cutoff = (now if now is not None else time.time()) - SETTLE_SECONDS
    found = []
    for path in input_dir.rglob("OR_ABI-L2-CMIP*.nc"):
        scan = parse_name(path)
        if scan is None or scan.band not in wanted or scan.satellite != satellite:
            continue
        if not scan.scene.startswith("F"):
            continue  # Only full disk covers the Caribbean every ten minutes.
        try:
            if path.stat().st_mtime > cutoff:
                continue
        except FileNotFoundError:
            continue  # Removed by the receiver's cleanup mid-scan.
        found.append(scan)
    return sorted(found, key=lambda s: (s.scan_start, s.band), reverse=True)


@dataclass
class State:
    """Names already archived, so reruns and restarts never duplicate work."""

    path: Path
    done: list[str] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path) -> State:
        try:
            return cls(path, list(json.loads(path.read_text())["done"]))
        except FileNotFoundError:
            return cls(path)

    def __contains__(self, name: str) -> bool:
        return name in self.done

    def add(self, name: str) -> None:
        self.done.append(name)
        self.done = self.done[-STATE_LIMIT:]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"done": self.done}))
        temporary.replace(self.path)


def product_key(scan: ScanFile, band_key: str, area: Area) -> str:
    return f"goes{scan.satellite}-{band_key}-{area.key}"


def storage_path(scan: ScanFile, band_key: str, area: Area) -> str:
    stamp = scan.scan_start
    return (
        f"{SOURCE}/{product_key(scan, band_key, area)}/{stamp:%Y/%m/%d}/"
        f"goes{scan.satellite}_{band_key}_{area.key}_{stamp:%Y%m%dT%H%MZ}.png"
    )


def payload(
    scan: ScanFile,
    band_key: str,
    band_title: str,
    area: Area,
    image: Path,
    size: tuple[int, int],
    run_id: str,
) -> dict[str, Any]:
    path = storage_path(scan, band_key, area)
    stamp = scan.scan_start.isoformat().replace("+00:00", "Z")
    return {
        "run_id": run_id,
        "storage_path": path,
        "name": Path(path).name,
        # Stable per product so the catalogue groups editions together.
        "image_url": f"{SOURCE}:{product_key(scan, band_key, area)}",
        "checksum": sha256(image),
        "fetched_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "observation_time": stamp,
        "time_basis": "filename",
        "width": size[0],
        "height": size[1],
        "file_size_bytes": image.stat().st_size,
        "frame_count": 1,
        "file_format": "PNG",
        "is_animated": False,
        "page_title": f"GOES-{scan.satellite} {band_title} · {area.title}",
        "raw_metadata": {
            "receiver_file": scan.path.name,
            "band": scan.band,
            "scene": scan.scene,
            "area": area.key,
        },
    }


@dataclass
class Result:
    archived: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


def collect(
    input_dir: Path,
    work_dir: Path,
    client: ArchiveClient | None,
    storage: Storage,
    bands: Iterable[int] = (13, 8),
    area: Area = CARIBBEAN,
    max_files: int = 12,
    coastlines: bool = True,
    renderer: Callable[..., tuple[int, int]] = render,
) -> Result:
    """Process at most max_files new scans; one bad file never stops the rest."""
    state = State.load(work_dir / STATE_FILE)
    pending = [s for s in discover(input_dir, bands) if s.path.name not in state]
    pending = pending[:max_files]
    result = Result()
    if not pending:
        return result
    run_id = client.start_run() if client is not None else None
    try:
        for scan in pending:
            band = BANDS[scan.band]
            path = storage_path(scan, band.key, area)
            image = work_dir / "images" / path
            try:
                size = renderer(
                    scan.path, band, area, scan.scan_start, image, coastlines=coastlines
                )
                storage.put(image, path)
                if client is not None and run_id is not None:
                    client.ingest(
                        payload(scan, band.key, band.title, area, image, size, run_id)
                    )
            except Exception as exc:  # recorded; the run continues
                result.failed.append(f"{scan.path.name}: {type(exc).__name__}: {exc}")
                continue
            state.add(scan.path.name)
            result.archived.append(path)
    finally:
        state.save()
        if client is not None and run_id is not None:
            client.finish_run(run_id, "failed" if result.failed else "finished")
    return result
