# contacts domain — agent context

**Owner:** Barrels platform (ADR-0028, foundations slice PF3). An organisation's contact book: one record per person per organisation, with consent and erasure in one place. Not a GAA/GMS module.

- Tables (main database, `org` schema): `org.contact` (`con_<hex>` id, `organisation_id` cascade, `email_hash` unique per organisation, `email` only while needed to send, `name`, `phone`, optional `user_id` Barrels ID link with no foreign key, free-text `source`, `erased_at`) and `org.contact_consent` (bigint identity id, `contact_id`, `organisation_id`, `purpose` marketing/service/analytics, `granted`, `source`, `granted_at`, `revoked_at`, `recorded_at`).
- **Matching:** exact `hash_email` match within one organisation only (`find_by_email`, `upsert_contact`). Never match or merge on name, phone or user link. `merge_contacts` is the only way to join two records; it is explicit, same-organisation, audited, moves the consent history, keeps the earlier `created_at`, fills blank name/phone/user link, and deletes the other record.
- **Upsert** keeps existing name/phone and fills blanks; passed consents add a history row only when the decision changes. An erased contact that returns is revived with only the data now supplied and no consent.
- **Consent history is append-only:** `set_consent` inserts, the current decision per purpose is the latest row (`current_consents`). Only merge re-parents rows. Consent cannot be set on an erased contact.
- **Erasure** (`erase_contact`): blanks email, name, phone and user link, sets `erased_at`, appends a revocation (source `erasure`) for every granted purpose, keeps the hash tombstone. Domains that reference a contact must respect `erased_at`.
- **Services flush; routers commit.** Other domains call the service functions (consumers: `bookings.customer.contact_id` is required and holds the booking role of a contact; billing keeps one organisation-level billing email).
- **Routes** (`/contacts`): `/org/contacts` list (paginated, `q` name search or exact email, `include_erased`), upsert (`POST`), `/{contact_id}` get and `PATCH` (name, phone), `/consents` get and `POST`, `/merge`, `/erase`; `/admin/contacts` superuser read. All `/org` routes use `require_org_app("contacts")`: members read, admins and owners write. The `contacts` product is in `organisations.entitlements.PRODUCTS` and is never granted automatically. No public routes.
- **Audit:** `audit.py` tracks contacts (excluding email, hash, name, phone) and consent rows under the `platform_organisation` subject; merge and erase add explicit entries. Logs carry no personal data.
- Retention: `docs/security.md` (data retention table).
- **Party/role references (ADR-0028):** a domain table with a required `contact_id` registers itself in `references.py` (`register(table)`, done in its `models.py`); `merge_contacts` re-points all registered rows to the kept contact before deleting the other. `create_without_email` makes a contact with no address (`email_hash` is NULL, never matched; used for walk-ins).

## Tests
`tests/contacts/test_contacts.py` (service rules, routes, roles, cross-organisation denial, entitlement, audit) and `tests/contacts/test_contacts_migration.py`.
