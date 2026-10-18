# storage domain — agent context

**Owner:** Barrels platform. S3-compatible object storage (DigitalOcean Spaces).

- `service.py`: boto3 is synchronous. Presigned-URL generation is local and safe in async code; network calls (`put_object`, `delete_object`) must be wrapped in `run_in_threadpool`.
- `router.py`: authenticated access to private weather image objects without cross-domain table access.
- Settings in `config.py` (`StorageConfig`). Never make buckets public or return raw bucket URLs for private objects.
- Tests: `tests/storage/test_storage_service.py`.
- Related: `docs/operations/storage-delivery.md`.

## Organisation-scoped uploads (F8)

- `uploads.py` + `uploads_router.py` (`/storage`), table `org.upload` (`models.py`, main Alembic `orgupload20261018`). Keys are `org/{organisation_id}/{app}/{purpose}/{uuid}.{ext}`; `PURPOSES` in `uploads.py` is the policy (app, max bytes, public flag). Allowed types: JPEG, PNG, WebP only. Add a purpose there, never accept a client-chosen key or type list.
- `POST /storage/uploads` records a pending row and returns a presigned PUT whose signature covers Content-Type and exact Content-Length (storage rejects a different body). `POST /storage/uploads/{id}/complete` HEADs the object, compares size and type (mismatch deletes the object and returns 422), and marks it complete; repeat calls are idempotent; links expire after 15 minutes (409). No dimension check: Pillow is only a transitive dependency.
- Auth: `UploadMember` (`dependencies.py`) applies the `OrgContext` denial rules (`resolve_org_context`) but also accepts app-scoped tokens, because Events signs in with an `app=events` token. An app token can only upload for its own app (403). Unconfigured storage answers 503 "Uploads are not configured".
- Reads never expose bucket URLs. `GET /storage/files/{id}` (organisation members only; other organisations and pending files are 404) returns a 5-minute presigned GET as JSON. Purposes with `public=True` (organiser logo, listing image) are also served unauthenticated by id through `GET /storage/public/{id}`: a 307 to a 5-minute presigned GET with `Cache-Control: public, max-age=120`. Other domains store only the file id and call `uploads.file_is_usable(file_id, organisation_id=…, purpose=…)` before saving it.
- Ops: the bucket needs a CORS rule allowing `PUT` with `Content-Type` from the web origins, or browser uploads fail.
- Tests: `tests/storage/test_uploads.py` (fake store: real signing, in-memory HEAD/DELETE).
