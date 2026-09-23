# FastAPI contract review — 23 September 2026

**Status:** Historical record  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-23

Scope: repository-wide inventory, prioritising active non-HR journeys. HR,
competence and employee setup are owned by the other model; no edits to them.
This is an initial evidence-backed review, not a claim that every business rule
has been audited. Baseline revision: `e4316039ae8e0ae64da3988cae51dda10d6fbcff`.

## Confirmed findings and proposed decisions

| Priority / domain | Evidence | Proposed correction and compatibility gate |
| --- | --- | --- |
| High: CAP | `CapInfoCreate(effective='2026-09-23T12:00:00', expires='2026-09-23T14:00:00Z', ...)` raises TypeError during comparison instead of ValidationError | Reject offset-free incoming CAP timestamps consistently before ordering. Keep response serialization of existing naive-UTC database values. Audit all create/import/info/reference consumers; regenerate OpenAPI/Kubb. Contract validation approval required. |
| High: eRegister | `RegisterObservationCreate` accepts whitespace station and offset-free observation time; `extra` fields silently discarded; router uses BrowserUser without a domain permission gate | Trim/reject empty station, require explicit input offsets, forbid unknown write-envelope fields; separate write DTO from read compatibility; define observation author/reviewer permissions and transition policy before lifecycle implementation. |
| Fixed: eRegister persistence | SQL text INSERT passed timestamp strings plus nested dicts directly to asyncpg untyped binds; real database test reproduced failure | Corrected native datetime/JSONB bindings; two persistence/auth tests pass. Wire contract unchanged; no migration needed. |
| Medium: public wxproducts | `PublicPublishedProduct(... publishedAt='not-a-date')` succeeds, while `PublishedProductBase` validates aware publication time | Align response timestamp type with UtcDateTime after checking legacy snapshots and anonymous consumers. This is contract weakness, not proof that invalid values reach the current feed. |
| Medium: wxproducts local dates | `IssueDetails(issuedAt='2026-99-99T99:99')` succeeds | Service `validation.validate` already checks calendar validity via `timestamp`/`local_time`; schema-only acceptance is not proof that publication accepts it. Add schema-level calendar validation without changing Grenada local-time semantics or draft partial entry policy. |
| Medium: auth security sessions | `SecuritySessionPublic` timestamps are arbitrary strings; service calls naive DB datetime `.isoformat()` without UTC suffix | Use UTC response serialization, test browser display outside Grenada/UTC; generated contract update and all auth consumers required. Leave shared base datetime semantics unchanged. |
| Medium: WxWatch | `verification_status`, `replica_state`, `time_basis`, event kind and identifiers are open strings; size/dimensions mostly lack bounds | Inventory stored/legacy values before enums/bounds. Preserve explicit unknown states and decoder/source provenance. Tightening without historical inventory could turn readable archives into 500 responses. |
| Missing capability: Clean | janitorial schemas expose catalogue only; no assignment/events/revision model | Exact proposed schema and permission contract in the pilot proposal; requires migration approval. |
| Missing capability: Quality | No controlled-document/findings lifecycle module in current domain inventory | Bounded proposal and immediate document register; approval before backend work. |
| Deferred: transport | Time/day/direction are strings in read-only catalogue DTOs | Document accepted legacy vocabulary before enums. No delivery expansion while transport remains deferred. |
| Reviewed surface: billing | Checkout response uses HttpUrl; webhook response is boolean | No defect established from these DTOs. Operational billing work is outside September scope. |
| Separate ownership: HR/baseline | HR domain schemas and shared employee setup exist across leave/roster/exchange/training/workflow etc. | Refer all behavioural changes to the HR model; global BaseModel changes are unsafe without both workstreams' compatibility checks. |

## Migration and contract strategy

### Approved correction batch

User approved the first bounded batch with “Continue.” CAP input timestamps now
require offsets before ordering, including sent/reference times and imported XML.
CAP duplication converts historical database timestamps through the UTC public
representation before constructing its new draft. eRegister create trims station
IDs, rejects blanks and extra envelope fields, and requires offsets for supplied
observation/issue times; read DTOs remain unchanged. Public wxproducts and account
security timestamps use UTC serialization and generated date-time validation.
No shared datetime type, HR schema or migration changed. The findings above are
retained as pre-change evidence; these four corrections are implemented, with
verification recorded in the readiness ledger. Other proposals remain open.

Do not combine a broad schema rewrite with release fixes. For each approved
change identify input/output/storage boundaries, inspect existing rows, reproduce
failure, update source schema/service, regenerate OpenAPI then Kubb, verify drift
and every callsite, and run positive/negative API and persisted-state tests.
Datetime response compatibility and strict incoming timestamps need separate
types; changing the shared `UtcDateTime` globally would also change HR behaviour.

Prioritise CAP mixed-time failure and eRegister persistence/input boundaries,
then publication/security timestamps and the CMS exact-revision relationship.
Typed schemas for remaining product kinds should reuse the existing outlook
pattern only after the product catalogue and partial-draft requirements are
confirmed. Do not replace permissive drafts with publish-only required fields.

Publication states, generated artifacts, validation results, queued delivery and
actual receipt need distinct contracts. eRegister's current `bufr`/`iwxxm` maps
are caller-supplied payloads, not proof of validated generated artifacts.
Do not label them accepted WIS2/aviation output.

## Observation lifecycle proposal (approval required)

Preserve `register_observations` and its original identity/station/kind/time.
Add integer `revision NOT NULL DEFAULT 1` and an append-only
`register_observation_revisions` table: `(observation_id uuid FK, revision integer
> 0)` primary key; `action` constrained to `created|edited|submitted|accepted|
rejected|corrected`; `snapshot jsonb NOT NULL`; `actor_id uuid NOT NULL`;
`recorded_at timestamptz NOT NULL`; `reason text NOT NULL` (1–4000 characters).
Backfill one snapshot per existing row with action `created`, identifying it as
a migration baseline, without inventing a historical actor/time. This needs an
explicit migration-actor policy; existing actor strings require inventory before
enforcing UUID storage. Do not rewrite old evidence to fit a guessed identity.

Proposed permissions: `eregister.observation.read`, `.create`, `.edit`, `.review`,
`.correct`, scoped to approved stations. Input/output schemas remain separate;
generated artifact/transport evidence becomes server-owned in a later accepted
integration contract. Existing authenticated users must receive reviewed grants
before enabling the new checks, otherwise rollout would revoke current access.

Proposed API: GET detail/history; PUT draft with expected_revision; POST submit,
review and correct with expected_revision and reason. Draft edits append history;
submit moves draft → qc_pending; independent reviewer chooses accepted/rejected;
rejected can return to draft with reason. Accepted content is immutable.
Correction creates a new draft with `supersedes_id`; accepting that correction
atomically supersedes the prior accepted record. Do not supersede the original
merely by starting a correction. Station/kind/observed-time identity changes need
a separate reviewed replacement procedure. No hard-delete or unreviewed publish.

Acceptance: save/reopen, rejected validation, permitted/forbidden transitions,
independent review, optimistic conflict, unchanged accepted originals, correction
chain and duplicate submission handling. WIS2 publication uses only the approved
handoff with traceable observation/revision; it is not implied by acceptance.

See [readiness evidence](../operations/launch-readiness-coverage.md) and
[Clean/Quality/CMS proposals](../products/gaa-clean-quality-cms-proposals.md).
