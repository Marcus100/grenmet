#!/usr/bin/env bash
# Installed in the image, with an image-owned list; accepts no user arguments.
set -euo pipefail
[[ $# == 0 ]] || exit 2
while IFS= read -r relative; do
  target="/workspace/$relative"
  mountpoint -q "$target" || {
    echo "Missing isolated mount: $relative. Rebuild the dev container." >&2
    exit 1
  }
done < /usr/local/share/grenmet-dependency-volumes.txt
# Only the roots of verified container volume mounts need ownership on first use.
while IFS= read -r relative; do
  chown node:node "/workspace/$relative"
done < /usr/local/share/grenmet-dependency-volumes.txt
