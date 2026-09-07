# Host apps and container development

Open the repository in VS Code using **Dev Containers: Reopen in Container**. Run application servers and Docker infrastructure from your host terminal with the existing pnpm commands. Use `/workspace` in the container for editing, tests, linting and type-checks.

Source files are shared. Each dev container has its own named volumes for the root and every workspace `node_modules`, Next.js `.next` directories and the root Turbo cache. Both `/workspace` and the host-path mirror use those same container-only volumes. Dependency checks remain enabled. A new container installs its dependencies once; subsequent installs are needed when dependencies change. The host keeps its own installation and caches.

## Apply this change

1. Save your files. In VS Code, run **Dev Containers: Rebuild Container** from the Command Palette. Let the post-create install finish. Host application containers and database volumes are independent of this rebuild.
2. The container startup check must report `Container dependency and build-cache mounts are isolated from the host.`
3. In a host terminal, run `pnpm install --frozen-lockfile` once if an older agent container last wrote the shared installation. Then use your existing app commands.
4. Run a container check, then restart a host app twice. With no dependency changes, switching between host and container should no longer cause installation on the host.

Rebuild every old agent container using this checkout, or stop using pnpm in those old containers: they still have the original shared mounts. Do not delete the host's `node_modules` or any database volume to apply this change.

## Adding a workspace

Add its dependency mount at both repository paths in `devcontainer.json`, using one `${devcontainerId}`-scoped volume and `volume-nocopy`. Update `dependency-volumes.txt`; Next apps also need a `.next` mount. Run `node --test scripts/guardrails/devcontainer-dependencies.test.mjs`, then rebuild. The image-owned ownership helper checks every declared mount before changing only its root owner.

References: [VS Code targeted named volumes](https://code.visualstudio.com/remote/advancedcontainers/improve-performance#_use-a-targeted-named-volume), [pnpm dependency verification](https://pnpm.io/settings/build#verifydepsbeforerun).


## When Docker inspect and the startup check disagree

`docker inspect` lists configured mounts; the startup check reads the active process mount table. Confirm the container ID in the terminal prompt is the one inspected. `node .devcontainer/check-dependency-isolation.mjs --diagnose` prints only the current hostname and mount metadata. Never bypass a failing check to install dependencies.

Deleting host mountpoint directories while a container is running can leave its existing mounts detached from the newly created paths. After saving work, stop that development container and reopen/rebuild it so Docker establishes mounts on the current directories. Do not remove named dependency volumes or database volumes to diagnose this. Verify isolation again before container pnpm commands, then verify host app startup twice. The actual stopped-container case from this session still requires this runtime acceptance check.
