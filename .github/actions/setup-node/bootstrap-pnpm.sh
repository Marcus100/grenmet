#!/usr/bin/env bash
# Bound registry stalls while installing exactly the repository's package manager.
set -euo pipefail

manager=$(node -p 'require("./package.json").packageManager')
case "$manager" in
  pnpm@*) ;;
  *) echo "Expected a pinned pnpm packageManager in package.json" >&2; exit 1 ;;
esac

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export COREPACK_DEFAULT_TO_LATEST=0
corepack enable pnpm
for attempt in 1 2 3; do
  if timeout --kill-after=5s 90s corepack install --global "$manager" &&
    timeout --kill-after=5s 15s pnpm --version; then
    exit 0
  fi
  echo "::warning::pnpm bootstrap attempt $attempt of 3 failed or timed out"
  if [ "$attempt" -lt 3 ]; then sleep 5; fi
done
echo "Unable to install $manager after three bounded attempts" >&2
exit 1
