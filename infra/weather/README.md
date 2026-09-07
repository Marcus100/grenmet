# Weather delivery and recovery

This target runs on a **separate weather droplet in each online environment**. It is not installed on the existing 2 GB staging core host. Nothing in this directory provisions droplets or replaces data volumes. Operator provisioning, actual image builds, a staging deployment, and a restore drill remain mandatory acceptance checks.

## Host prerequisites

Use Python 3.11 or newer, Node 24, Docker Compose with `!reset` support, AWS CLI, and systemd. The vendored monitoring stack also requires its Loki Docker logging driver and a reviewed, non-conflicting `10.5.0.0/24` monitoring subnet. Check the upstream runtime requirements and measure SURFACE worker memory/CPU before selecting host size; the shipped worker counts are not a sizing recommendation.

Register a deployment runner with labels `self-hosted`, `staging` or `production`, and `weather`. Only trusted deployment workflows may use it. Enforce this with runner-group workflow restrictions and GitHub environment deployment-branch rules (staging branch for staging; reviewed version tags for production). Labels alone do not isolate a self-hosted runner from arbitrary repository workflows. Never approve an untrusted PR job onto these runners. Keep `/opt/grenmet` pointed at the trusted deployed checkout for host timers; do not point it at a developer checkout or PR runner. Provision `/var/lock/grenmet` writable by the runner/collector account. The deployment, weather backup and collector launcher share `weather.lock` there. Core delivery uses `/var/lock/grenmet-core-<environment>.lock`; provision that file writable by the core runner and use `scripts/production/core.sh` for both manual and scheduled operations.

Create DNS for SURFACE, wis2box and monitoring on the weather IP. Allow public 80/443 to Traefik and restrict SSH to operator addresses. Do not publish PostgreSQL, Elasticsearch, MinIO, Redis or Memcached. Allow weather-to-core 5432 only over the VPC, from the weather host, with corresponding PostgreSQL access rules. Inventory any MQTT/FTP publishing requirements before opening additional source-restricted ports; no public publishing-port change is automatic.

Provision each reviewed external volume/network and existing bind directory explicitly. Preserve the actual SURFACE PostgreSQL path, including an existing `pgdata` nesting if present. A missing directory fails deployment rather than silently creating a new database. Provision the PostgreSQL/MinIO/Elasticsearch services and initial empty state on a brand-new host before its first mandatory backup; record that the host is new. Existing hosts require inventory and a backup of their existing state before adoption.

## Operator configuration

Secrets live in private **`.env.local` files**, never in the repository. Do not shell-source these files. The JSON files below contain only names, paths, and non-secret choices. Set private file permissions and preserve existing passwords and signing keys.

`/etc/grenmet/weather.json`:

```json
{
  "environment": "staging",
  "env_file": "/etc/grenmet/weather/.env.local",
  "surface_project": "surface-staging",
  "wis2box_project": "wis2box-staging",
  "proxy_project": "weather-proxy-staging",
  "surface_url": "https://surface.staging.example.test",
  "wis2box_url": "https://wis2box.staging.example.test",
  "backup_config": "/etc/grenmet/weather-backup.json",
  "collectors_config": "/etc/grenmet/collectors.json"
}
```

Replace example domains, project names, and paths with reviewed values. The weather `.env.local` must provide all required Compose substitutions:

- SURFACE: `SURFACE_ENV_FILE` pointing to its own private `.env.local`, `SURFACE_DATA_ROOT`, `SURFACE_STATIC_ROOT`, `SURFACE_PG_HBA`, `SURFACE_REDIS_VOLUME`, `SURFACE_HOST`, and immutable `SURFACE_REDIS_IMAGE`, `SURFACE_MEMCACHED_IMAGE`, `SURFACE_NGINX_IMAGE`.
- Proxy: `WEATHER_PROXY_NETWORK`, `WEATHER_CERTS_VOLUME`, `WEATHER_TLS_EMAIL`. Existing certificates remain on that volume.
- wis2box: `WIS2BOX_ENV_FILE` pointing to its existing private `.env.local`, `WIS2BOX_HOST_DATADIR`, `WIS2BOX_HOST`, `WEATHER_MONITOR_HOST`, `GRAFANA_ADMIN_PASSWORD`, and all external volume names in the deployment overlay. Set `WIS2BOX_SNAPSHOT_ROOT` to an existing directory writable by Elasticsearch; it mounts at `/snapshots` and is configured as `path.repo`.
- Supply reviewed `@sha256:` image references for every variable in `docker-compose.wis2box-images.yml`, plus `WIS2BOX_ES_EXPORTER_IMAGE`. Start with the supported vendored release; do not upgrade its engines as part of adoption. SURFACE's application digest is selected automatically from the workflow commit.

Set repository variables `WEATHER_STAGING_ENABLED` and `WEATHER_PRODUCTION_ENABLED` only after provisioning the corresponding host. Until then, pipelines report **UNCONFIGURED**, and no weather runner is scheduled. Core and weather delivery have separate entrypoints. Weather deploys only after its images and core delivery succeed. Enabled collectors receive matching immutable image digests in a generated `collectors.release.json`; operator definitions remain unchanged.

## Backups

`/etc/grenmet/weather-backup.json` names the same environment/projects as the deployment descriptor:

```json
{
  "environment": "staging",
  "surface_project": "surface-staging",
  "wis2box_project": "wis2box-staging",
  "archive_image": "reviewed-image-with-tar@sha256:REPLACE_WITH_REVIEWED_DIGEST",
  "minio_endpoint": "http://PRIVATE_MINIO_ADDRESS:9000",
  "archives": {
    "surface-files": {"type": "bind", "source": "/srv/surface/data", "include": ["media", "shared", "exported_data", "documents"]},
    "wis2box-config": {"type": "bind", "source": "/srv/wis2box-data", "include": ["."]},
    "wis2box-auth": {"type": "volume", "source": "EXISTING_AUTH_VOLUME", "include": ["."]},
    "mosquitto-config": {"type": "volume", "source": "EXISTING_MQTT_VOLUME", "include": ["."]},
    "grafana": {"type": "volume", "source": "EXISTING_GRAFANA_VOLUME", "include": ["."]},
    "prometheus": {"type": "volume", "source": "EXISTING_PROMETHEUS_VOLUME", "include": ["."]},
    "loki": {"type": "volume", "source": "EXISTING_LOKI_VOLUME", "include": ["."]}
  }
}
```

These are inventory examples, not volume-creation instructions. Never point `surface-files` at a live database directory. MinIO must be reachable only privately by the backup host, with external writers blocked during the maintenance window. Its bucket object bytes are copied through the S3 API; retain the configuration that defines bucket permissions and publishing behavior.

The backup stops the currently running application/monitoring writers, dumps SURFACE, creates and verifies an Elasticsearch snapshot, copies MinIO objects and required state, then restarts the prior writers. It uploads the resulting artifacts and verifies sizes before publishing the completion marker. Source services incur a maintenance window during capture. If the host is killed or loses power, inspect and resume the previously running services before retrying; no script can guarantee cleanup after host failure.

Provide the backup service's `/etc/grenmet/backup/.env.local` with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_EC2_METADATA_DISABLED=true`, `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `MINIO_BACKUP_ACCESS_KEY_ID`, and `MINIO_BACKUP_SECRET_ACCESS_KEY`. Use a separate backup bucket for each environment and enforce a 30-day lifecycle for all its backup prefixes. GitHub weather delivery receives the same values from environment-scoped secrets; its AWS values map from `DO_SPACES_ACCESS_KEY_ID`, `DO_SPACES_SECRET_ACCESS_KEY`, and `DO_SPACES_REGION`.

Object backups run with the core daily/pre-deployment entrypoint. The `grenmet-files-backup@objects` timer is an alternative for an operator-managed schedule, not an additional required duplicate job: `/etc/grenmet/objects.json` contains `environment`, `kind: "objects"`, `source_bucket`, `source_endpoint`. Its private `/etc/grenmet/objects/.env.local` supplies the AWS/destination settings above plus `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` for read-only source access. Enable source Spaces versioning first. The tool copies the versions present at its cutoff, preserves delete markers, and rejects a changed source history. Empty valid buckets are supported.

Sutron remains SQLite at the edge. Its `sutron.json` contains `environment`, `kind: "sutron"`, the absolute existing `sqlite` archive path and `handoff_directory`. Use a standalone Python 3.11+ interpreter without upgrading the legacy system Python. Adapt the file-backup unit's interpreter, checkout path and account to the inventoried edge host. The SQLite backup API captures WAL state and checks database integrity; CSV/ASC handoff files are archived separately. This does not alter serial-port schedules, the legacy collector, or SURFACE's pull behavior.

Install and enable the appropriate daily timer templates only after a successful manual backup on that host. Enable environment variables `WEATHER_BACKUP_ENABLED` and `SUTRON_BACKUP_ENABLED` in GitHub only when those integrations are configured. Hosted freshness checks always require core and objects and additionally check the configured weather/edge stores. Unconfigured stores remain visible in workflow summaries and block full infrastructure acceptance. Enable GitHub workflow failure notifications for the operators; inspect timer failures in the host journal as well.

## Collectors

`/etc/grenmet/collectors.json` is a mapping from job name to `enabled`, `kind`, `env_file`, `args`, and `mounts`. Default to `enabled: false` until source credentials, inputs and outputs are verified. Deployment supplies `image` in the separate release descriptor.

- wxwatch: one job per source (`goes19`, `sfcana`, `cimss`, `trackthetropics`, `uwyo`), with `kind: "wxwatch"`, `args: ["<source>"]`, and a mode-600 `.env.local`. Explicitly configure the matching core database and Spaces bucket; `DB_HOST` must be the core VPC address. The crawler owns its existing freshness and timeout contracts.
- GMS ingestion: `kind: "gms-ingest"`, `args: ["collect", "--output-dir", "/data/nhc"]`; mount an existing output directory there with `readonly: false`. Verify the existing web/file publishing handoff separately.
- GEONETCast runs locally only. Its Docker target remains available for local work, but CI does not publish it and the online deployment and collector launcher reject it. The missing GDAL NumPy extension remains a local follow-up.

Mount entries use `source` (absolute existing host directory), `target` (under `/data`), and `readonly` (defaults true). Writable directories must allow collector UID 10001. Each enabled source is bounded to three attempts, with source-level overlap protection and a shared weather maintenance lock. The timer template runs every 15 minutes with no concurrent invocation of the same unit. Source-specific calendar overrides may reduce frequency after observing publication schedules; never change freshness contracts to hide stale data.

## Isolated restore acceptance

Download a selected batch's `success.json`, then run `restore-files.py` with a **new** destination directory. It refuses existing destinations and verifies every downloaded artifact's size and SHA-256. This is download verification, not proof that an application can recover.

On an isolated restore host:

1. Restore core and SURFACE custom dumps with matching PostgreSQL engines/extensions using the guarded PostgreSQL restore command. Apply the proposed migrations and verify representative records and baseline markers.
2. Mount the downloaded Elasticsearch repository into a separate compatible Elasticsearch instance, register it read-only, restore its `complete` snapshot and verify index counts and representative documents. Never register the production repository writable from a drill.
3. Restore MinIO objects into new isolated buckets, reapply required bucket/auth settings from the backed-up configuration, and verify downloads and a test publishing path. Restore configuration and monitoring archives into new volumes, using safe archive extraction.
4. Open the copied Sutron SQLite archive read-only, check integrity, representative observations and the archived handoff files. Do not replace the edge archive during a drill.
5. Verify source-date filtering and private gallery retrieval through the matching core API, record backup cutoff and total recovery duration, and retain the evidence with the release.

Production requires this staging evidence and a demonstrated recovery point within 24 hours and recovery within the following day. Missing hosts, credentials or inputs are **unverified**, never a passing gate.
