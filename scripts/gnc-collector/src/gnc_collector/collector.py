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
# --dry-run keeps its own memory so a trial never marks files done for real.
DRY_RUN_STATE_FILE = "processed-dry-run.json"
STATE_LIMIT = 5000
# A file that fails this often is given up on, so a few permanently broken
# files cannot hold the newest-first queue and starve older good files.
MAX_ATTEMPTS = 3


def candidates(
    input_dir: Path, bands: Iterable[int], satellite: int = 19
) -> list[tuple[ScanFile, float]]:
    """Full-disk CMIP files for the bands with their modification times."""
    wanted = set(bands)
    found = []
    root = input_dir.resolve()
    for path in input_dir.rglob("OR_ABI-L2-CMIP*.nc"):
        # FAZZT writes regular files; a link could point outside the folder.
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            continue
        scan = parse_name(path)
        if scan is None or scan.band not in wanted or scan.satellite != satellite:
            continue
        if not scan.scene.startswith("F"):
            continue  # Only full disk covers the Caribbean every ten minutes.
        try:
            found.append((scan, path.stat().st_mtime))
        except FileNotFoundError:
            continue  # Removed by the receiver's cleanup mid-scan.
    return found


def discover(
    input_dir: Path,
    bands: Iterable[int],
    satellite: int = 19,
    now: float | None = None,
) -> list[ScanFile]:
    """Settled full-disk CMIP files for the bands, newest first."""
    cutoff = (now if now is not None else time.time()) - SETTLE_SECONDS
    found = [
        scan
        for scan, modified in candidates(input_dir, bands, satellite)
        if modified <= cutoff
    ]
    return sorted(found, key=lambda s: (s.scan_start, s.band), reverse=True)


@dataclass(frozen=True, slots=True)
class BandFreshness:
    band: int
    newest: str | None
    received_minutes_ago: float | None  # when the file reached the folder
    scan_minutes_ago: float | None  # when the satellite scanned it


def freshness(
    input_dir: Path,
    bands: Iterable[int],
    satellite: int = 19,
    now: float | None = None,
) -> list[BandFreshness]:
    """Newest file per band, by arrival at the receiver and by scan time."""
    moment = now if now is not None else time.time()
    found = candidates(input_dir, bands, satellite)
    report = []
    for band in sorted(set(bands)):
        mine = [(scan, modified) for scan, modified in found if scan.band == band]
        if not mine:
            report.append(BandFreshness(band, None, None, None))
            continue
        scan, modified = max(mine, key=lambda item: item[1])
        report.append(
            BandFreshness(
                band,
                scan.path.name,
                (moment - modified) / 60,
                (moment - scan.scan_start.timestamp()) / 60,
            )
        )
    return report


@dataclass
class State:
    """Names archived or given up on, so reruns never duplicate work."""

    path: Path
    done: list[str] = field(default_factory=list)
    failures: dict[str, int] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> State:
        try:
            data = json.loads(path.read_text())
            return cls(
                path,
                [str(n) for n in data["done"]],
                {str(k): int(v) for k, v in data.get("failures", {}).items()},
            )
        except FileNotFoundError:
            return cls(path)
        except ValueError, KeyError, TypeError:
            # A damaged file must not stop every future pass. Starting empty
            # re-renders files still on disk; the API deduplicates them.
            path.replace(path.with_suffix(".corrupt"))
            return cls(path)

    def __contains__(self, name: str) -> bool:
        return name in self.done or self.failures.get(name, 0) >= MAX_ATTEMPTS

    def add(self, name: str) -> None:
        self.failures.pop(name, None)
        self.done.append(name)
        self.done = self.done[-STATE_LIMIT:]

    def fail(self, name: str) -> int:
        self.failures[name] = self.failures.get(name, 0) + 1
        if len(self.failures) > STATE_LIMIT:
            self.failures = dict(list(self.failures.items())[-STATE_LIMIT:])
        return self.failures[name]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"done": self.done, "failures": self.failures}))
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
    state_file: str = STATE_FILE,
) -> Result:
    """Process at most max_files new scans; one bad file never stops the rest."""
    state = State.load(work_dir / state_file)
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
                attempt = state.fail(scan.path.name)
                result.failed.append(
                    f"{scan.path.name}: {type(exc).__name__}: {exc}"
                    f" (attempt {attempt} of {MAX_ATTEMPTS})"
                )
                continue
            state.add(scan.path.name)
            result.archived.append(path)
    finally:
        state.save()
        if client is not None and run_id is not None:
            try:
                client.finish_run(run_id, "failed" if result.failed else "finished")
            except RuntimeError as exc:
                # e.g. the 45-minute lease expired; the next pass can start once
                # the API expires it. Report rather than hide the results.
                result.failed.append(f"finishing run: {exc}")
    return result
