#!/usr/bin/env bash
# Read-only host inventory. Never displays container environment/secret values.
set -euo pipefail
command -v docker >/dev/null || { echo "Run this on the Docker host, not inside the devcontainer" >&2; exit 1; }
docker context show
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
for container in $(docker ps -aq); do
  docker inspect --format '{{.Name}} {{range .Mounts}}{{.Type}}:{{.Name}}:{{.Source}} -> {{.Destination}}; {{end}}' "$container"
done
docker volume ls
