#!/usr/bin/env bash
# Run a single Scrapy spider. Usage: ./run_spider.sh <spider_name>
# Spider names: cimss, goes19, sfcana, trackthetropics, uwyo

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SPIDER_NAME="${1:-}"
if [[ -z "$SPIDER_NAME" ]]; then
  echo "Usage: $0 <spider_name>" >&2
  echo "Spiders: cimss, goes19, sfcana, trackthetropics, uwyo" >&2
  exit 1
fi

uv run scrapy crawl "$SPIDER_NAME"
