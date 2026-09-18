# WxWatch archive model and meteorological alignment

Status: partially implemented; reviewed against the repository on 2026-09-17. The implementation ledger and next migration sequence below distinguish delivered capabilities from target design. Updating this plan does not apply migrations or change runtime behaviour.

## Objective and boundary

Build a staff-only archive in gaa-admin, owned by FastAPI and the separate WxWatch database. Begin with existing imagery, then integrate the existing NHC collector. Preserve the information needed to compare all GMS meteorological products by time, space and physical meaning. Keep SURFACE, WIS2box, forecasts and CAP authoritative for their own records. Hybrid storage is a target, not an existing capability.

## Repository evidence

| Existing component | Reuse | Gap or constraint |
| --- | --- | --- |
| [WxWatch API schemas](../../apps/api/fastapi/src/wxwatch/schemas.py) | Image records, source-qualified keys, timestamp provenance, UTC gallery slots | Catalogue separates editions and assets; synoptic gallery and paginated archive coexist; delivery still uses legacy image paths |
| [WxWatch ingestion](../../apps/api/fastapi/src/wxwatch/ingestion.py) | Authenticated workers, collection leases and URL/checksum idempotency | Retrievals and exact-request retries are recorded; reviewed cross-URL identity and correction relationships remain incomplete |
| [Collectors](../../scripts/scrapy-wxwatch/app/spiders/) | GOES, surface analysis, CIMSS, tropical imagery and soundings | Mixed timestamp precision; aggregated sources differ from original issuing agencies |
| [NHC registry](../../scripts/gms-ingest/src/gms_ingest/registry.py) | Product IDs, kinds, groups, codes, storm IDs and parent IDs | Discovery IDs need explicit mapping to recurring products and individual editions |
| [NHC collector](../../scripts/gms-ingest/src/gms_ingest/collector.py) | Run manifests, originals, collection/decode status, source hashes and decoded results | Text importer and guidance reader are implemented; non-text import is pending; first grid cycle is currently projected onto issued_at |
| [NHC storage](../../scripts/gms-ingest/src/gms_ingest/storage.py) | Atomic JSON publication and decoder/options-dependent artifact identity | Local paths must become replica locations, not asset identity |
| [Notebook parameters](../../notebooks/models/CANONICAL_PARAMS.md) | Existing parameter names and conversions | Rainfall accumulation windows differ; relative/absolute vorticity and CAPE definitions are not interchangeable |
| [Sutron observations](../../scripts/sutron-collector/src/sutron_collector/models.py) | Station IDs, raw lines, values and status tokens | Batch collection time is not automatically observation time |
| [SURFACE/WIS2 decision](../adr/0010-wis2-publishing-via-surface-builtin.md) | Existing publication bridge and source ownership | Preserve observation identity through CSV/BUFR publication; do not build a second publisher |
| [Forecast models](../../apps/api/fastapi/src/wxproducts/models.py) and [CAP models](../../apps/api/fastapi/src/cap/models.py) | Product revisions, alert identifiers and snapshots | Reference exact revisions/snapshots through APIs; no cross-database foreign keys |
| [GeoNetCast](../../geonetcast/README.md) and [notebooks](../../notebooks/README.md) | Existing research/processing code | Do not describe training scripts or notebooks as deployed ingestion services |

## Proposed records

Use UUIDs for new archive identities. Preserve legacy integer IDs through an explicit mapping. Names, paths and URLs can change without changing a product's identity.

| Record | Key fields | Responsibility |
| --- | --- | --- |
| Source | id, key, name, source role, authority URL | Distinguish issuing agency from distributor/collector; TrackTheTropics is not automatically the author of its linked products |
| Product | id, stable key, issuer reference, title, product type, nominal coverage, platform/instrument/channel, active status | A recurring product, such as one satellite channel/sector or a station sounding |
| Product alias | product id, namespace, external key, mapping provenance | Retain WxWatch keys, NHC registry IDs and former URLs; reviewed mappings can link the same product reached through different collectors |
| Edition | id, product id, source edition identifier, revision/correction marker, supersedes id, event references, temporal metadata, actual coverage | One issue, observation or forecast run/edition, independent of file format and storage |
| Asset | id, SHA-256, byte size, detected media type, representation/schema version, dimensions/frame count where relevant | Immutable bytes; identical bytes may support multiple editions without merging those editions |
| Edition asset | edition id, asset id, role, original filename | Many assets per edition and reusable assets; roles include original, text, graphic, decoded and preview |
| Replica | id, asset id, backend id, relative object key, state, verified checksum, verified_at | One physical local/cloud copy; no credentials, expiring URLs or host-specific absolute paths in public contracts |
| Retrieval | id, run id, source URL, requested_at, received_at, HTTP metadata, result, asset/edition references | Record every attempt or confirmed sighting, including unchanged content and failures |
| Derivation | input asset ids, output asset id, processor/version, options, generated_at | Reproduce decoded data, crops, projections and notebook outputs without overwriting originals |
| Metadata revision | subject id, revision, recorded_at, actor/processor, evidence, changed fields | Correct extracted times/coverage with an audit trail; originals stay immutable |

Continue using collection_runs for bounded attempts and source locks. Asset checksums deduplicate bytes, not meteorological events. An ETag is HTTP metadata, not a guaranteed content checksum.

## Time model

All instants are timezone-aware UTC. Retain the original time token and source convention as evidence. A null timestamp means unknown; never replace it silently with collection time.

- observation_start/end: observation or scan support. A point observation can have a single instant; do not fabricate duration.
- issued_at: publisher's issue time, where established.
- reference_time: model initialization or reference cycle; this is not necessarily publication time.
- valid_start/end: forecast/analysis validity. Keep analysis instants distinguishable from intervals.
- first_received_at: when this system first obtained the edition; separate subsequent retrievals and last_seen_at.
- published_at/source_available_at: only when supported by source evidence; a late backfill does not prove earlier local availability.
- Per-time provenance: basis, exact/estimated/unknown status, original token and extraction/version evidence. HTTP Last-Modified remains source_modified_at, not an observation time.
- Field/segment-level time: grids, bulletins, TAF groups and animations can contain multiple valid times. Edition-level bounds support discovery but must not flatten those details into one timestamp.

Comparison has two distinct modes: meteorological retrospect (best available later evidence) and operational replay (records actually received before a cutoff). Forecast verification chooses a specified issue/lead-time policy and excludes later amendments. Store the cutoff and policy version with results. Reconstruct source availability only where evidence supports it.

Three-hour slots remain a presentation/query policy, not stored weather timestamps. Select by product-specific rules with explicit tolerance and show the actual time, offset and uncertainty. Missing slots remain gaps by default. Cross-midnight candidates must be considered where the chosen tolerance permits them.

## Space and meteorological meaning

Keep nominal product coverage separate from edition coverage and from the geographic subset produced by a decoder. For example, the NHC decoder's bbox is not necessarily the original GRIB domain.

Represent station/point/area/grid/profile/track support explicitly. Preserve station ID namespaces (including WIGOS/ICAO where supplied), native coordinates/CRS, horizontal resolution and vertical reference. Geographic search can use a normalized longitude/latitude footprint with transformation provenance; do not claim a raster is georeferenced merely because it depicts a labelled map. Handle antimeridian coverage explicitly rather than assuming west is always less than east.

Attach field descriptors to numeric decoded data: source parameter identifier, canonical variable mapping/version, native and normalized units, vertical level/type, statistic, accumulation/averaging interval, ensemble member and quality flags. Preserve distinctions such as absolute versus relative vorticity and different CAPE definitions. Reuse notebook mappings as candidates requiring semantic review, not as proof of equivalence.

Spatial/temporal matching, interpolation and aggregation are explicit comparison operations with method/version and distance/tolerance. Do not equate an area forecast with one station or treat an image pixel as a calibrated numeric observation. No numeric values are inferred from chart colours without a validated decoder.

## Mapping current products

| Current stream | Proposed stable product | Edition/time treatment |
| --- | --- | --- |
| GOES-19 | Issuer + platform + instrument + sector + channel/composite | Filename-derived observation time retained; scan interval only if available |
| Surface analysis | Issuer + analysis type + region | Current minus-three-hours/rounding result remains estimated; original modification time preserved |
| CIMSS | Issuer + diagnostic + region + layer/channel | Rounded modification time stays labelled as estimated evidence until a product-time parser is validated |
| TrackTheTropics | Reviewed mapping to original issuer/product, with aggregator as retrieval source | Do not merge products just because filenames match; retain every source URL as provenance |
| UWyo | Issuer + station namespace/ID + sounding product | Observation date/time belongs to edition, not product identity; blocked collection remains visibly unavailable |
| NHC text/storms | Existing code/type and agency; storm reference attached to editions as appropriate | Preserve advisory number, issue/correction and parsed validity; retain original bulletin |
| NHC grids/maps/recon | Existing registry and decoded field identities | Keep per-field validity, cycle, geometry/profile metadata; retain raw and derived assets separately |

METAR/SPECI/SYNOP/TAF are report/product types; BUFR/IWXXM/text are representations. Equivalent representations may be linked using source identifiers and verified metadata. Matching station and timestamp alone is insufficient to merge corrections or reports of different types. An equivalence link records its evidence and confidence.

## Hybrid storage

Start with the current local directory and private cloud bucket as configured backends. An asset can have multiple replica records. Replication states are pending, copying, verified, failed or missing; failed attempts retain retry details. Copy to a temporary destination, check byte length and SHA-256, then publish/mark verified. Never mark a copy complete merely because it was queued.

FastAPI authorizes the asset request and chooses an available verified replica by policy. Client-facing URLs address the asset, not its physical location. Keep the existing path route as a compatibility adapter during migration. Cloud URLs are short-lived capabilities issued after authorization.

Do not delete a sole verified replica. Retention/deletion is a later explicit policy with event/research holds. Back up catalogue and bytes coherently and test restoring both; replication is not backup. No automatic deletion during the pilot. Measure bytes per product/day before promising long-term capacity.

## Implementation ledger

| Capability | State and evidence | Remaining boundary |
| --- | --- | --- |
| Dedicated WxWatch migration ownership | FastAPI Alembic revisions through `wxwatch_0005` | Legacy compatibility rows remain; do not remove them before read reconciliation |
| Catalogue and backfill | User reported 60 records verified and applied | This is historical evidence, not a continuously current file-health check |
| Image ingestion | One transaction writes compatibility row, edition, verified local asset and retrieval; user completed a live surface-analysis crawl | Global catalogue lock is a pilot throughput constraint; cloud-only ingestion does not verify remote bytes |
| Archive browsing | Source/product/date filters, unknown-time search, pagination and visual comparison implemented | Offset pagination is not a stable snapshot export or numerical verification |
| NHC text import | User applied a manifest with four eligible products; originals checked and text/provenance retained | Manual import; failed attempts without edition links are not shown as edition history |
| NHC guidance | Existing `/wxproducts/nhc` provides guidance; `?view=editor` retains outlook authoring; text and edition-linked events are exposed | Latest reader implementation has automated tests; user visual acceptance is not recorded here |
| Hybrid storage | Asset/replica foundation exists | Replication, retention enforcement, failover and restore rehearsal are not implemented |
| Common meteorological comparison | Time/space/meaning requirements are documented | Cross-domain adapters, comparison policies and reproducible verification remain future work |

## Next migration sequence and acceptance gates

This sequence supersedes the original sequence. Keep manual collector runs and
imports during migration. Scheduling and automatic NHC import are explicitly
deferred by the user, as are Hono and Payload migration. Preserve separate
domain databases and Kubb-generated web contracts.

### 1. Asset delivery and derivation foundation

Add authenticated asset-ID delivery that resolves registered replicas through
server-configured backend roots. Preserve the legacy WxWatch image route during
transition. NHC originals use extensionless checksum paths and cannot be served
by simply appending them to the current image route. Do not move files to fit
that route or expose filesystem paths/credentials in public contracts.

Record derivations as input asset(s), output asset, processor/version, options
and generation-time evidence. The existing collector's artifact key includes
source SHA-256, kind, bbox and decoder version; reuse its evidence while also
hashing the actual output bytes. A generated timestamp remains unknown unless
supported; importer execution time is not decoder execution time. A new decoder
version or different bbox creates a distinct derivation, not a replacement of
the original. Allow an edition to have multiple representations without
creating a separate meteorological edition for each representation.

Gate: unauthenticated requests rejected; unregistered, missing and corrupt
replicas handled explicitly; paths confined to configured roots; MIME and
inline/download policy validated; original and derived checksums reconciled;
repeat imports idempotent; two option/version sets coexist. Do not serve active
HTML/SVG as trusted same-origin content. Apply checks appropriate to the actual
format rather than claiming a file extension establishes its content.

### 2. NHC raster imagery

Extend manual import to existing image records and expose originals through
asset IDs in NHC Products. Keep storm, product and source references. Preserve
GIF animation and original dimensions; unknown issue/valid times remain unknown.
Retain uncertainty when a timestamp is inherited from discovery metadata.

Gate: preview/apply reconciles manifest counts and actual bytes; retries and
changed content preserve editions; authenticated viewing works from the existing
NHC Products route; no chart is labelled georeferenced solely because it depicts
a geographic area. No new downloader or scheduling layer.

### 3. NHC vectors and map packages

Preserve original ZIP/KML/KMZ and separately catalogue decoded GeoJSON and
embedded overlays with derivation links. Keep feature-level `when`, `begin` and
`end`, native spatial evidence, transformed CRS evidence and overlay rotation.
An overlay footprint is not interchangeable with a vector feature footprint.
Do not merge network-linked children merely because they share a parent storm.

Gate: bounded archive extraction and safe member paths; linked assets traceable;
unsupported geometry remains explicit; original versus decoded coverage kept
separate; antimeridian/rotation cases handled or explicitly marked unsupported;
no untrusted markup rendered directly from KML descriptions.

### 4. NHC grids and decoded numerical data

Preserve original GRIB and derived NetCDF as linked assets. The collector currently
copies the first grid cycle into `issued_at`: correct that interpretation at the
adapter boundary and retain the original manifest token as evidence. Decode
reference cycle from per-record `dataDate`/`dataTime`; never claim it is publisher
issue time. Keep per-field validity rather than flattening a multi-time file.

Retain parameter identifiers/table versions, units, vertical level/type,
statistical processing and averaging/accumulation interval, and ensemble/member
information where present. Existing decoder fields are a starting point, not a
complete verification-ready contract. Inventory missing metadata before claiming
compatibility. Native grid coverage and the decoded bbox are distinct; the
current longitude mask does not support a west-greater-than-east antimeridian
subset and must not silently return misleading coverage.

Gate: mixed-validity fields and cycles preserved; unknown publication time stays
null; original coverage is not replaced by subset bounds; outputs match their
input and options; missing values survive; incompatible units, levels or
accumulation periods cannot silently compare as equivalent. No interpolation or
numerical verification added as an incidental migration feature.

### 5. Reconcile remaining GMS ownership

Inventory actual callers before removing legacy code. Web-side schema/type
files alone do not establish an active database writer. Trace forecasts,
aviation reports and observations, CAP, Sutron, SURFACE/WIS2, GeoNetCast and
notebook outputs to their owner, API, database and source representation. Preserve
approved forecast revisions and CAP snapshots. Existing SURFACE/WIS2 publication
ownership stays intact. Keep Janitor/Bus and other nonmeteorological programmes
outside this NHC slice; sequence them through the broader migration plan.

Gate: each domain has one authoritative writer/migration owner; web/PWA callers
consume API contracts; old and new reads reconcile before removal; cross-domain
links reference exact owner IDs/revisions through APIs, not cross-database
foreign keys. Operational replay uses receipt cutoffs and excludes later
corrections; retrospective comparison is a separate policy.

## Decisions and remaining confirmation

Defaults already agreed: staff-only gaa-admin, separate databases, FastAPI ownership, Kubb generation, all collected versions retained, original files preserved, no automatic deletion, gaps rather than silent stale substitution, and reuse of existing integrations.

No user choice blocks planning the next asset/derivation slice. Numerical tolerances, station/reference datasets, product-specific comparison rules, replica priority and retention thresholds require evidence before operational verification or automated deletion. Do not invent precision or claim standards compliance from this schema alone.

## Catalogue pilot implementation

Revision `wxwatch_0003` adds the catalogue alongside the existing gallery tables.
The bounded backfill preserves every legacy image ID as a separate edition,
retains its metadata snapshot and file path, and hashes local bytes with SHA-256.
A matching legacy MD5 or SHA-256 establishes continuity with the old record;
without an old checksum, the mapping is explicitly `unverified` with
`current_bytes_only` evidence. A replica's `verified` state means its current
bytes match the new asset hash, not that its historical provenance is proven.
Unknown coverage and issue/validity times remain null. Estimated observation
labels become nominal times, not measured observation times.

From `apps/api/fastapi`, with the normal WxWatch database configuration loaded:

```bash
uv run --frozen --package fast-back alembic -c src/wxwatch/alembic.ini upgrade head
uv run --frozen --package fast-back python scripts/backfill_wxwatch_catalogue.py --images-root ../../../scripts/scrapy-wxwatch/data/images --limit 100
uv run --frozen --package fast-back python scripts/backfill_wxwatch_catalogue.py --images-root ../../../scripts/scrapy-wxwatch/data/images --limit 100 --apply
```

The command defaults to a read-only count preview; only `--apply` writes records.
Resume with `--after-id` set to the returned `last_id`, until `processed` is zero.
Each batch commits atomically and can safely be repeated. Omit `--images-root`
when no local root is configured to catalogue metadata without claiming file
verification. Use a stable `--backend-key` for each physical storage backend;
changing that key creates a distinct replica location.

Review missing, mismatched, unsafe and unsupported files before switching reads.
Retry from the beginning after restoring files: metadata-only runs preserve
verification state, while actual rescans invalidate missing or changed replicas.
This slice does not change gallery reads or collector writes, copy files to the
cloud, or implement the later retrieval/derivation history tables. Rerun the
backfill to include newly collected legacy rows until the write-path cutover.

### Automatic ingestion pilot

Revision `wxwatch_0004` adds retrieval history. Apply it before running collectors
against the updated API (from `apps/api/fastapi` on the host):

```bash
docker compose -p grenmet-api --env-file .env.local exec api uv run --frozen --package fast-back alembic -c src/wxwatch/alembic.ini upgrade head
```

Ingestion now commits the compatibility gallery row, catalogue edition, and
retrieval together. Exact payload retries within the same run are idempotent;
a different fetch timestamp or run records another sighting. Conservative
edition matching includes source, name, URL, checksum, observation time,
source-modified time and time evidence. Changed bytes or changed temporal
evidence therefore remain separate editions. This is not yet a reviewed
cross-URL equivalence or correction/supersession model.

When a local image root is configured, FastAPI hashes and inspects the original
file in a worker thread before writing. Missing or mismatched files return 422;
a path already registered to different bytes returns 409 and rolls back the
transaction. Local replicas use the same `local-primary` backend as the default
backfill. Without a local root, metadata and retrieval history are recorded but
assets remain pending verification; no cloud bytes are claimed verified.

Collector request/response schemas and gallery reads are unchanged. The legacy
row is a compatibility record within the single FastAPI transaction, not a
second independent writer. Operator backfill and ingestion share a transaction
lock during this pilot; this serializes catalogue writes and should be replaced
with narrower locking before high-volume ingestion. Historical retrievals cannot
be reconstructed from old rows and are not fabricated by the migration.

### NHC text import pilot

Revision `wxwatch_0005` adds `archive_nhc_text` and `archive_nhc_events`. The
operator command `apps/api/fastapi/scripts/import_nhc_archive.py` imports one
version-2 per-run manifest from the existing gms-ingest archive. Eligible records
are `text`, `bulletin`, or `outlook` kinds in the text/storms groups. It does not
fetch NHC data or import grids, recon, maps or storm-discovery JSON.

Preview verifies original bytes against SHA-256 and size, validates the decoded
source hash, reads bounded decoded text, and requires timezone-aware timestamps.
Apply commits the entire manifest's eligible records atomically. Repeating an
identical record/run is idempotent; changed original bytes retain distinct
editions. Importing older runs later updates first receipt to the earliest
known download. Registry keys are conservative product identities; equivalent
products at different URLs are not merged. Storm IDs and bulletin codes are
preserved, with decoded metadata and a checksum of that decoded artifact.
Decoded text is collector output, not independently re-decoded by this adapter.

Issue time is retained as issue/nominal time with source-issue evidence.
Observation, forecast cycle and validity fields remain unknown. Failed attempts
have no edition link and never republish cached old bytes. HTTP 304 events keep
the original download time and later check time separately. Import time is
recorded separately and is not used as a meteorological timestamp.

Use a stable `nhc-local` backend key for this archive root, distinct from WxWatch
image storage. No files move and no public URLs are created. NHC Products now
renders text on demand, labels issue time/storm references, and shows edition-linked
NHC events alongside image retrieval history. The shared archive includes an NHC
source filter and text comparison. Unlinked failed NHC attempts remain stored
but are not presented as the history of a specific edition.

The first real read-only preview processed four text products from saved run
`20260905T123318776004Z-313e70ba`. The user subsequently applied the migration and
imported those four products successfully. This does not imply that every saved
manifest or newly collected product has been imported.
