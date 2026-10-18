# feedback domain — agent context

**Owner:** Barrels platform. Anonymous "Was this page helpful?" answers from public sites (first user: the docs site).

- `POST /api/v1/feedback` (public, 10/min per IP) stores a `page_feedback` row: `site` slug, `page_path`, `helpful`, optional `comment` (max 1000). Answers 202.
- No personal data: no email, name, user id or IP is stored. Do not add any. The comment is free text; the UI must tell visitors not to put personal details in it.
- Nothing is emailed. Read the rows with SQL until an admin view exists.
- A new site needs no migration: it just sends its own `site` slug.

## Tests
`tests/feedback/test_feedback.py`.
