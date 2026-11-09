# CI base images (GHCR mirror)

**Status:** Mirror workflow and script in place; rollout in progress ([#816](https://github.com/Marcus100/grenmet/issues/816))  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-09

Docker Hub limits how many images one account (or one runner address) may pull.
About 15 open pull requests build 13 or more images at once, so CI and staging
builds hit `429 Too Many Requests` even though the workflows log in to Docker Hub.
The fix is to copy every third-party Docker Hub image we build from or run into
GitHub's registry (GHCR, free, no pull limit for workflows) and pull from there.
Digest pins are kept, so the images are byte-for-byte the ones already reviewed.

## How it works

```text
Dockerfiles, compose files, workflows          scripts/ci/base-images.mjs
   (the only list of images; no second list) -> derives the images to copy
                                                         |
                          .github/workflows/mirror-base-images.yml
        docker buildx imagetools create  docker.io/library/node@sha256:X
                                      -> ghcr.io/marcus100/base/node:sha256-X
```

- **Single source of truth.** `scripts/ci/base-images.mjs` reads Dockerfile `FROM`
  and `COPY --from` lines, workflow `services:` and `container:` images, the
  `driver-opts: image=` of `docker/setup-buildx-action`, and pinned images in
  compose files. There is no separate list to keep in sync.
- **Mapping, same digest.** `docker.io/library/node@sha256:X` becomes
  `ghcr.io/marcus100/base/node@sha256:X`; `docker.io/postgis/postgis@sha256:X`
  becomes `ghcr.io/marcus100/base/postgis/postgis@sha256:X`. The owner is lower-case.
  The copy is an unchanged image index, so the digest is identical; the workflow
  checks this after every copy and fails if it differs.
- **Tags in the mirror.** Each pinned digest is stored under the tag
  `sha256-<hex>`, which keeps it from being garbage collected. Each upstream tag
  that appears in a pin (for example `24-alpine`) is also refreshed daily from Docker
  Hub, so the mirror's `24-alpine` always points at the newest digest. The Dockerfile
  keeps `node:24-alpine@sha256:...`; Docker uses the digest and ignores the tag.
- **BuildKit.** `docker/setup-buildx-action` pulls `moby/buildkit` from Docker Hub
  too. The script always mirrors `moby/buildkit:buildx-stable-1` (it is in
  `IMPLICIT_IMAGES`), and workflows point `driver-opts` at the mirror copy.
- **Registry login.** The mirror is public, so builds and service containers pull it
  anonymously and need no credentials. Do not add Docker Hub `credentials:` to a
  service that uses the mirror; Docker Hub credentials are rejected by GHCR.

Commands (run from the repository root, no network needed except `bump`):

```bash
node scripts/ci/base-images.mjs list                 # every managed image and where it is used
node scripts/ci/base-images.mjs plan                 # the copy operations the workflow runs (JSON)
node scripts/ci/base-images.mjs check                # unpinned Dockerfile and service images
node scripts/ci/base-images.mjs check --require-mirror  # also: anything still on Docker Hub
node scripts/ci/base-images.mjs bump [--apply]       # move pins to the mirror's newest digest
```

## Rollout order

The mirror must hold an image before anything builds from it. Merge in this order.

1. **Mirror workflow and script** (owner merge into `dev`). The pull request pins the
   one unpinned service image (`postgres:17` in `ci-api.yml`) to its current digest
   on Docker Hub, so nothing changes for CI yet. The merge is a push to `dev` that
   touches the workflow, so **Mirror base images** runs without waiting for `main`
   (dispatch and schedule only work once the file is on `main`). It copies every
   pinned digest found on `main`, `staging` and `dev`.
2. **Make each package public (once per package).** The first run copies everything
   but ends red at "Verify the packages are public": new GHCR packages start private
   and a personal account has no API to change that. In GitHub, open your profile,
   Packages, then each `base/...` package listed in the run summary, Package settings,
   Danger Zone, Change visibility, Public. Re-run the workflow; it must finish green.
   If a package does not accept pushes from the workflow, open Package settings,
   Manage Actions access, and add this repository with the Write role.
3. **Dockerfiles** (agent merge). Re-run the pull request's checks; its builds now
   pull from the mirror. Merge into `dev`. Open Dependabot pull requests that touch
   `FROM` lines will conflict; Dependabot rebases or recreates them.
4. **Workflows** (owner merge): service containers, BuildKit builder image and the
   repository guard test point at the mirror. Merge after step 3 is green on `dev`.
5. Promote `dev` to `staging` and `main` as usual. The nightly schedule starts once the
   workflow is on `main`.

Rollback at any step: revert the pull request. Docker Hub references still work.

## Adding or changing an image

1. Write the reference as `ghcr.io/marcus100/base/<name>:<tag>@sha256:<digest>` (the
   digest is the one Docker Hub serves for `<tag>`: `docker buildx imagetools inspect
   <name>:<tag> --format '{{.Manifest.Digest}}'`).
2. Get it into the mirror **before** the pull request builds: run **Mirror base images**
   with the `extra_ref` input set to your branch name (dispatch works once the workflow
   is on `main`). A push to `dev`, `staging` or `main` that touches a Dockerfile, compose
   file or workflow runs it automatically, which covers merged changes but not a pull
   request that is still open. A new image name is a new package: make it public
   (rollout step 2).
3. Run `node scripts/ci/base-images.mjs check --require-mirror`. The repository test
   `scripts/ci/base-images.test.mjs` fails on an unpinned Dockerfile or service image.

Pinning something new directly from Docker Hub is only for the paths in
`HUB_ALLOWED_PREFIXES` (the devcontainer and the vendored `surface/` files).

## How version bumps flow

- **Dockerfiles and compose files: Dependabot.** The `docker` and `docker-compose`
  entries in `.github/dependabot.yml` read `ghcr.io/marcus100/base/node:24-alpine@...`,
  look up the mirror's `24-alpine` tag, and open a pull request that moves the digest.
  That digest is already in the mirror because the mirror refreshes the tag daily.
  Only digest refreshes of a tag flow through the mirror, because the mirror holds
  only the tags we use. Moving to a new tag (a new Node release line) is a manual edit
  of the tag and digest in the Dockerfiles, after the new tag is in the mirror (see
  "Adding or changing an image").
- **Workflow service images: the script.** Dependabot does not read `services:`
  in workflows. Run `node scripts/ci/base-images.mjs bump --apply` (needs Docker and
  network) to move every pinned reference to the digest the mirror's tag points at now,
  and commit the result.
- If Dependabot cannot read the public GHCR package (unverified until the first run),
  use `bump --apply` for Dockerfiles too, and keep the Dependabot `docker` entries only
  for the devcontainer and `surface/`.

## When the mirror is stale or broken

| Symptom | Cause | Action |
| --- | --- | --- |
| `manifest unknown` or `not found` pulling `ghcr.io/marcus100/base/...@sha256:...` | A digest was referenced before it was copied | Run **Mirror base images** (`extra_ref` for a branch that is not on `dev` yet), then re-run the failed job |
| `denied` or `unauthorized` on an anonymous pull | A package is still private | Make it public (rollout step 2) |
| Mirror workflow red at "Copy images by digest" | Docker Hub unreachable or a digest differs after copy | Re-run once; if a digest differs, the copy changed the manifest, so stop and open an issue with the log |
| Mirror workflow red at "Verify the packages are public" | New or reset package | Make the listed packages public |
| Nightly run stopped | Scheduled workflows are disabled after 60 days without repository activity | Re-enable under Actions, or dispatch it once |
| Need builds green right now and the mirror is down | | Revert the Dockerfile pull request; Docker Hub pins still work |

## Not covered

- `.devcontainer/Dockerfile` and the vendored `surface/` files (see `VENDORED.md`) stay on
  Docker Hub; they are not part of the release builds. Their digests are still mirrored.
- Local development compose files (`apps/api/fastapi/docker-compose.yml`,
  `infra/docker/docker-compose.yml`) use unpinned or developer-chosen images.
- The deployment compose file `infra/docker/docker-compose.deploy.yml` still pulls
  Traefik, Adminer, the socket proxy and the reviewed PostgreSQL and Redis images from
  Docker Hub on the server (`CORE_POSTGRES_IMAGE`, `CORE_REDIS_IMAGE`). Their digests are
  already mirrored; switching the server to the mirror is a separate change.
- `restore-drill.yml` pulls its PostgreSQL image from the `postgres_image` input.
- Trivy fetches its vulnerability database from GHCR (`ghcr.io/aquasecurity`), not Docker Hub.
- `ghcr.io/astral-sh/uv` is already on GHCR.
