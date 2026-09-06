"""Commands for collection, status, and local grid queries."""

import argparse
import json
import sys
from pathlib import Path

from . import registry
from .storage import read_json

DEFAULT_ROOT = Path(__file__).resolve().parents[4] / "data" / "gms-ingest" / "nhc"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    collect = commands.add_parser(
        "collect", help="Collect current selected products once"
    )
    collect.add_argument("--groups", default="all")
    collect.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        default=registry.DEFAULT_BBOX,
    )
    status = commands.add_parser(
        "status", help="Show local product status without network access"
    )
    point = commands.add_parser(
        "point", help="Export native grid values nearest a location"
    )
    point.add_argument("--lat", type=float, required=True)
    point.add_argument("--lon", type=float, required=True)
    for command in (collect, status, point):
        command.add_argument("--output-dir", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args(argv)
    root = args.output_dir.expanduser().resolve()
    try:
        if args.command == "collect":
            groups = (
                registry.GROUPS if args.groups == "all" else set(args.groups.split(","))
            )
            if not groups or groups - registry.GROUPS:
                parser.error(
                    "--groups must be all or a comma-separated selection of "
                    + ",".join(sorted(registry.GROUPS))
                )
            west, south, east, north = args.bbox
            if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
                parser.error("Invalid bounding box")
            from .collector import collect as run

            success, path = run(root, groups, tuple(args.bbox))
            print(
                f"NHC collection {'succeeded' if success else 'partially failed'}: {path}"
            )
            return 0 if success else 1
        index = read_json(root / "latest.json")
        if not index or index.get("schema_version") != 2:
            raise ValueError("No version-2 product index; run nhc collect first")
        from .collector import is_stale

        for product in index["products"].values():
            product["stale"] = (
                True
                if product.get("status") == "failed" and product.get("decoded_file")
                else is_stale(product)
            )
        if args.command == "status":
            for product in index["products"].values():
                print(
                    f"{product['id']}: {product['status']} | issued={product.get('issued_at')} | attempted={product.get('attempted_at')} | stale={product.get('stale')}"
                    + (f" | {product['error']}" if product.get("error") else "")
                )
            return 0
        if not (-90 <= args.lat <= 90 and -180 <= args.lon <= 180):
            parser.error("Coordinates outside latitude/longitude bounds")
        from .grids import point as sample

        results = []
        for product in index["products"].values():
            if (
                product.get("kind") != "grid"
                or not product.get("decoded_file")
                or not product.get("active")
            ):
                continue
            decoded = root / product["decoded_file"]
            results.append(
                {
                    "product_id": product["id"],
                    "status": product["status"],
                    "stale": product.get("stale"),
                    "source_sha256": product.get("decoded_source_sha256"),
                    "records": sample(decoded.parent / "grid.nc", args.lat, args.lon),
                }
            )
        if not results:
            raise ValueError("No decoded grids available")
        print(
            json.dumps(
                {"latitude": args.lat, "longitude": args.lon, "products": results},
                indent=2,
                allow_nan=False,
            )
        )
        return 0
    except ImportError as error:
        print(
            f"Missing decoder dependency: {error}. Run uv sync --frozen --package gms-ingest.",
            file=sys.stderr,
        )
        return 1
    except (OSError, ValueError, RuntimeError) as error:
        print(f"NHC: {error}", file=sys.stderr)
        return 1
