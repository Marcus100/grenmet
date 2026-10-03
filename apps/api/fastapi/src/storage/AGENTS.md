# storage domain — agent context

**Owner:** Barrels platform. S3-compatible object storage (DigitalOcean Spaces).

- `service.py`: boto3 is synchronous. Presigned-URL generation is local and safe in async code; network calls (`put_object`, `delete_object`) must be wrapped in `run_in_threadpool`.
- `router.py`: authenticated access to private weather image objects without cross-domain table access.
- Settings in `config.py` (`StorageConfig`). Never make buckets public or return raw bucket URLs for private objects.
- Tests: `tests/storage/test_storage_service.py`.
- Related: `docs/operations/storage-delivery.md`.
