# Host apps and container development

Open the repository in VS Code using **Dev Containers: Reopen in Container**. Run application servers and Docker infrastructure from your host terminal with the existing pnpm commands. Use `/workspace` in the container for editing, tests, linting and type-checks.

Source files are shared. Each dev container has its own named volumes for the root and every workspace `node_modules`, the root Python `.venv`, Next.js `.next` directories and the root Turbo cache. Both `/workspace` and the host-path mirror use those same container-only volumes. Dependency checks remain enabled. A new container installs frozen Node dependencies and the FastAPI Python workspace (including development tools) before VS Code attaches. Python 3.13 lives in the image; the virtual environment never references the host interpreter. A new container installs its dependencies once; subsequent installs are needed when dependencies change. The host keeps its own installation and caches.

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


## Editor and rebuild acceptance

Open the repository from its WSL Linux path (`~/grenmet`), then use **Dev Containers: Rebuild Container**. Attaching to an already-running old container does not apply changed mounts or lifecycle commands. Wait for post-create setup to complete; do not run host and container installs against the same dependency directories.

After rebuilding, run inside `/workspace`:

```bash
node .devcontainer/check-dependency-isolation.mjs
pnpm exec turbo --version
.venv/bin/python --version
.venv/bin/python -c "import fastapi, pytest, mypy; print('Python tooling OK')"
docker version
```

The Docker check must show both client and server access for the `node` user. If it does not, inspect the Docker-outside-of-Docker feature's startup log and socket group; never make the socket world-writable. Docker access controls the host daemon, so open only trusted repositories in this development container.

VS Code uses the TypeScript 7 extension and the admin workspace's catalog-managed TypeScript package. Check **TypeScript: Enable TypeScript 7** if an existing editor session retains the old service. Python defaults to the root `.venv`; existing VS Code selections may need **Python: Select Interpreter** once after rebuilding. Ruff handles Python formatting and mypy provides type diagnostics. Generated dependency/build/cache directories are excluded from file watching.

The initial Python sync installs FastAPI tooling only. Sync other uv workspace members explicitly when needed; this shared Python environment may change packages when switching members. GeoNetCast still needs its own native-import verification. App servers and databases continue to run on the host. The `wis2box-data` bind mount requires the existing host directory; preserve its contents.

A rebuild preserves source, Git history, login volumes and database volumes. Do not run Docker volume pruning or delete host `node_modules` while old containers are still using that shared path. Rebuild all old containers before using package managers in them. This repository cannot inspect or override your Windows/WSL VS Code user settings; verify formatter, interpreter and extension placement in the rebuilt remote window.

The Node base and globally installed agent CLIs currently track their configured release channels; rebuilds may update them. The Docker feature is locked and uv is pinned to the same version/digest as the repo's Python images. Dependency versions remain controlled by `pnpm-lock.yaml` and `uv.lock`.
