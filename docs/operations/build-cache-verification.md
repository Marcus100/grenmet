# Core build inputs and cache verification

Each included Node image installs the same workspace manifest graph before
copying its application source and transitive workspace dependencies. GMS-only
source edits therefore leave unrelated application source layers unchanged.
Shared manifest changes invalidate dependency installation; shared source changes
invalidate every consumer that copies that source.

The dependency-closure regression reads actual workspace manifests and checks
source isolation and manifest ordering for every included Node image.
Existing BuildKit caches, image smoke tests and vulnerability gates remain.

## Evidence and outstanding measurements

Local frozen dependency installation reused 1,283 packages and took 28.3 seconds.
This is dependency setup evidence, not an image-build speed comparison.
Docker daemon access is unavailable in the agent container, so no controlled
cold/warm comparison or image export, scanning, cache export, pull and readiness
timings have been measured for this candidate. No fixed speedup is claimed.

On the same Docker-capable runner, record runner resources, commit, base image
digests and cache state. Measure cold and warm builds of that commit, then a
GMS-only source edit, then a shared-package edit. Use disposable test branches
for edits. Record installation, compilation, image load/export, scanning,
registry/cache export, image pull, migration and readiness separately.
Warm builds must reuse unchanged expensive layers; shared dependency edits must
invalidate every affected consumer. Retain logs and image revisions.

Ten minutes remains an initial-feedback measurement target, not a full
build-and-deployment duration promise.
