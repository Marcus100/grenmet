# profile_images domain — agent context

**Owner:** Barrels platform (#1303). The photo on a Barrels account. Not a GAA/GMS module.

- **Table:** `public.user_image` (`src.auth.models.UserImage`, one row per user, `ON DELETE CASCADE` since `profileimage20261113`). `object_key` is the storage prefix of one upload (`users/<user_id>/profile-image/<hex>`); its sizes are `<prefix>/<64|256|512>.webp`. A new upload gets a new prefix, so cached pages never show a half-replaced photo, and the old files are deleted after the commit. The older baseline table `userimage` is unused and kept untouched (owner decision); `src/model_registry.py` tells Alembic to ignore it.
- **Owner decisions (2026-11-13):** the person uploads and replaces their own photo, with no approval step. HR (`hr.employment.manage` over the person, via `can_act_on_user`) and superusers may remove one, but nobody uploads for someone else. Visible only to the person, superusers and people sharing an organisation (`service.shares_organisation`: active membership of the same active platform organisation, or active employment in the same HR organisation).
- **Upload:** the raw request body (`image/jpeg`, `image/png` or `image/webp`; 415 otherwise), read by `router._read_image_body`, which refuses at 5 MB from the declared length or while streaming (413). Not multipart: a form is parsed whole before the handler runs, so it could not be capped.
- **Processing** (`images.py`, pure, run in a thread, at most two at once per process via `service._PROCESSING`): JPEG, PNG or WebP, at least 32 px a side, at most 16 megapixels (checked from the header before decoding; JPEG decodes at reduced scale). `exif_transpose`, square centre crop, WebP at quality 85. Re-encoding copies no metadata. Pillow is used directly here as in `hr/signatures` and `wxwatch`; it is not a declared dependency of fast-back.
- **Reads:** `GET /profile-images/org/{user_id}` answers a 307 to a 5-minute presigned GET. A hidden photo and a missing one are the same 404, so the route cannot reveal who has a photo outside your organisations. Web apps link it same-origin through their `/api` proxy; HR's `ProfileIdentityPublic.avatar_url` is that link with `?size=256&v=<version>`.
- **Audit:** `audit.py` tracks `UserImage` as `profile_image` under the `employee` subject (the storage key is excluded).
- **Account deletion:** `auth.service.delete_user` reads the prefix first and deletes the stored files after the row cascades.
- **Registration:** `register.py` (ADR-0031 manifest) names the router and the audit register; the model is auth's, loaded by `src/model_registry.py`.
- Contract: `docs/api/contracts.md` → Profile photos. Retention: `docs/security.md`.

## Tests
`tests/profile_images/test_profile_images.py` (processing and EXIF removal, upload, replace and remove, the organisation visibility rules, the identical 404, HR removal and its audit entry, 503 without storage, account deletion, the HR avatar link). A fake store keeps objects in memory.
