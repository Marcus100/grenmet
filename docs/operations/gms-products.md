# GMS authored products

The product desk in gaa-admin uses the existing wxproducts Postgres database.

- Impact-Based Forecasts: `/wxproducts/fcsts` (morning, midday, evening).
- NHC Products: `/wxproducts/nhc` (Tropical Weather Outlook).
- Bulletins: `/wxproducts/bulletins` (all nine hazard categories).

The evening forecast covers tonight plus the following four calendar days.
Morning is issued at 07:00, midday at 12:00, evening at 18:00; marine at 05:00.
Tropical Weather Outlook is issued at 02:00, 08:00, 14:00 and 20:00.
These are Grenada times. Select the date and scheduled issue before authoring.
Reports are independently entered; automatic carry-forward is not enabled.

Additional schedules supplied: METAR hourly; TAF 00:00/06:00/12:00/18:00;
SYNOP (wxRegister) hourly on the hour. Their timezone and activation scope
are awaiting confirmation. Aviation has a browser-saved draft composer and PDF preview; it does not transmit messages. wxRegister retains its development example.
The example PDFs define fields only; no historical issues are imported.
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

CAP is independent. These bulletins do not create CAP messages, synchronize
their statuses or contribute to CAP warning counts. Linking is deferred.

## Configuration and rollout

Run the existing wxproducts migration command before using the desk:

```sh
pnpm --filter @barrelsgd/web-gaa-admin db:wxproducts:migrate
```

Set `WXPRODUCTS_API_URL` for the gms server to the reachable gaa-admin origin.
The gms server reads `/api/public/products` from that origin. No browser token
or CORS setup is needed. An unset URL shows issued-product feeds as unavailable; the homepage and update blog use explicitly dated September 8 reference reports.

The public GET endpoint accepts an optional `kind` query parameter and returns
`{ products: PublishedProduct[] }`. Only current published snapshots cross this
boundary; draft values, actor IDs, and revision history are never exposed. Invalid
kinds return 400; a storage outage returns 503. Responses are not cached.

Public pages: `/products/forecasts`, `/products/nhc`,
`/products/bulletins`, and `/products/issued/<id>`.
`/marine/forecast` also shows issued marine bulletins.
All product forms have printable PDF previews, including the restored forecast and marine layouts and complete data sheets. There is no public archive, automatic NHC import or deployment in this change. Existing legacy product tables and example document components
remain available; the new desk stores authored drafts/publications separately.
