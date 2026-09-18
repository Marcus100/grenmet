# GMS authored products

The product desk in gaa-admin calls FastAPI, which owns authoring and migrations in the separate wxproducts Postgres database.

- Forecasts: `/wxproducts/fcsts` (morning, midday, evening).
- NHC Products: `/wxproducts/nhc` (Tropical Weather Outlook).
- Bulletins: `/wxproducts/bulletins` (all nine hazard categories).

The evening forecast covers tonight (18:00–07:00) plus four days, each 07:00–07:00.
Morning covers 07:00–07:00 the next day; midday covers 12:00–07:00 the next day.
The editor and write boundary derive validity and evening dates from the issue date.
The existing JSON content storage is retained. A dedicated Alembic baseline adopts verified Drizzle history without resetting product records.
Morning is issued at 07:00, midday at 12:00, evening at 18:00; marine at 05:00.
Tropical Weather Outlook is issued at 02:00, 08:00, 14:00 and 20:00.
These are Grenada times. Select the date and scheduled issue before authoring.
Reports are independently entered; automatic carry-forward is not enabled.

Additional schedules supplied: METAR hourly; TAF 00:00/06:00/12:00/18:00;
SYNOP (wxRegister) hourly on the hour. Their timezone and activation scope
are awaiting confirmation. Aviation has a browser-saved draft composer and PDF preview; it does not transmit messages. wxRegister retains its development example.
Local test publications adapted from the September 10 PDFs can be created with
`node --env-file=.env.local scripts/publish-local-forecasts.mjs --date=2026-09-14 --apply`
from gaa-admin. These are explicitly labelled historical test weather; the fourth
evening day is invented. Set `AUTH_API_URL` to a local FastAPI URL and supply
`WXPRODUCTS_ACCESS_TOKEN` for an authorized local author. The script uses the
private authoring API, records the authenticated actor, and never overwrites existing
records. It no longer writes directly to PostgreSQL. With `--apply`, it calls FastAPI preview
validation before each new publication and submits the returned normalized values;
validation failures stop publication. The write endpoint revalidates every request.
Without `--apply`, it only prints unvalidated fixture JSON, requiring no API access.
Use a suitable current test date; historical dates can fail the backend expiry rules.
Outlook systems are entered as a narrative with a paragraph for each named wave/system.

## Publication process

An active authenticated product author can save incomplete drafts. Publication
requires valid fields, explicit preview confirmation, and an issue/revision note
after the first save. Author identity is taken from the validated session; the
forecaster field records the operational forecaster. Superusers retain access.
Ordinary authors need active GMS employment, an active ingested grade, and an
unrevoked staff credential. The default permitted grades are GMS_MANAGER,
GMS_ASSISTANT_MANAGER and GMS_SENIOR_TECH. Account activation alone is insufficient.

Superusers can read `GET /api/v1/hr/setup/product-access` and replace a product's
policy with `PUT /api/v1/hr/setup/product-access/{kind}`, supplying
`{"grade_ids":["GMS_SENIOR_TECH"]}`. An empty list permits only superusers.
`GET /api/v1/hr/product-access/me` returns the current user's permitted kinds.
Policies are audited and evaluated on each request; different products may
permit different grades. CAP retains its independent authorization policy.

Each save records an immutable revision with actor, time, action, note and content.
A draft edit preserves the public snapshot. Conflicting saves are rejected.
Withdrawal requires a reason and removes the public snapshot; history remains.

Times are Grenada local time (UTC−04:00). Only issued, currently valid publications
appear publicly. Future, expired and withdrawn products are excluded. Feed
failure is shown as unavailable, never as an all-clear.

Forecasts may be published before their issue time. `publishedAt` records the
publication event; `values.issuedAt` gates public visibility. At noon a published
midday report replaces morning, and at 18:00 evening replaces midday. Late
midday/evening reports leave the previous report visible. Tonight retains its
issue-date tab across midnight until 07:00. At 07:00 the date strip advances;
without a new morning report it says “Awaiting today’s morning forecast”.
Future date tabs use the latest visible evening outlook, showing full weather
details and each period’s coverage. An open page refreshes every 30 seconds.
Forecast warnings and impacts are optional legacy fields, excluded from forecast
displays; CAP remains the independent warning source. No missing assessment is
rendered as “Minimal” or an all-clear.

CAP is independent. These bulletins do not create CAP messages, synchronize
their statuses or contribute to CAP warning counts. Linking is deferred.

## Configuration and rollout

The FastAPI prestart container applies the wxproducts migration before the desk
starts. For a manual local migration, run:

```sh
cd apps/api/fastapi
uv run --frozen --package fast-back alembic -c src/wxproducts/alembic.ini upgrade head
```

Set `WXPRODUCTS_API_URL` for the gms server to the reachable gaa-admin origin.
The gms server reads `/api/public/products` from that origin. No browser token
or CORS setup is needed. Local development defaults to `http://localhost:3001`;
deployed environments must supply their reachable gaa-admin origin. Unavailable
feeds never fall back to the dated September reference weather on the homepage.

The public GET endpoint accepts an optional `kind` query parameter and returns
`{ products: PublishedProduct[] }`. Only current published snapshots cross this
boundary; draft values, actor IDs, and revision history are never exposed. Invalid
kinds return 400; a storage outage returns 503. Responses are not cached.

Public pages: `/products/forecasts`, `/products/nhc`,
`/products/bulletins`, and `/products/issued/<id>`.
`/marine/forecast` also shows issued marine bulletins.
All product forms have printable PDF previews, including the restored forecast and marine layouts and complete data sheets. There is no public archive, automatic NHC import or deployment in this change. Existing legacy product tables and example document components
remain available; the new desk stores authored drafts/publications separately.

## Database handover

FastAPI prestart owns weather migrations. The weather URL must target the existing
separate database; this is not a database consolidation. The baseline verifies
Drizzle hashes and the expected table/column/constraint/index/enum structure before
adoption. Stop and reconcile a mismatch rather than stamping an unknown schema.
Historical Drizzle files/journals remain as reference; new weather migrations use
`src/wxproducts/alembic.ini`. No production migration or deployment is performed
merely by editing these files.

Backend authorization reads identity/grade policy from the main database; product
writes and their audit records use one transaction in the weather database. No
cross-database write transaction is assumed. CAP authorization is unchanged.
The unused structured morning-product server action and its direct database client have been removed. Legacy tables and pure assembly/schema helpers remain for compatibility. Gaa-admin weather readiness now checks FastAPI, and the web runtime no longer needs weather database credentials. Hono is deferred. The product editor now calls FastAPI using the existing HttpOnly session cookie and a session-bound CSRF token. Next.js performs runtime URL rewriting only; it no longer exchanges sessions or executes product server actions. Server-rendered page guards and other apps retain their existing session adapters. Add the editor origin to FastAPI BACKEND_CORS_ORIGINS for cookie-authenticated mutations. Production browser acceptance remains required.
