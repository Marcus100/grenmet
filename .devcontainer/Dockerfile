# Dev container image for running coding agents (Claude Code, Codex) fully
# inside Docker. Everything the agent edits or executes happens in here, not
# on your Windows host.
FROM node:24-bookworm@sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0

# Avoids apt-get prompting for input (e.g. tzdata) during unattended builds.
ENV DEBIAN_FRONTEND=noninteractive

# System tools the agents commonly shell out to (git, search, curl, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates \
      less \
      ripgrep \
      procps \
      sudo \
      util-linux \
      python3 \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Geospatial C libraries for geonetcast/ — the GDAL and HDF4 Python bindings
# compile against these at `uv sync` time (no wheels on PyPI). The gdal pin in
# geonetcast/pyproject.toml must match this image's libgdal version.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgdal-dev \
      gdal-bin \
      libhdf4-alt-dev \
    && rm -rf /var/lib/apt/lists/*

# uv — Python package manager used by apps/api/fastapi. Installed system-wide
# so the agent can work on the FastAPI app too.
COPY --from=ghcr.io/astral-sh/uv:0.12.17@sha256:10787c682e4184e4f290de1171fd4703dc63de99221f10fe1c99002ce7fa9acc /uv /uvx /usr/local/bin/

# Keep the Python interpreter in the image, outside mutable login/cache volumes.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
ENV UV_PYTHON=3.14.7
RUN uv python install 3.14.7

# pnpm v12 via corepack (matches the monorepo's package manager)
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

# The coding agents themselves. Pinned so a rebuild doesn't silently drift —
# bump deliberately (check current versions with `npm view <pkg> version`).
RUN npm install -g @anthropic-ai/claude-code@2.1.277 @openai/codex@0.155.1

# GitHub CLI (gh) — used by the repo's issue/PR workflow. Official apt repo.
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Config/cache dirs backed by named volumes (see devcontainer.json) so logins
# and download caches survive container rebuilds.
RUN mkdir -p /home/node/.claude /home/node/.codex /home/node/.config /home/node/.cache \
    && chown -R node:node /home/node/.claude /home/node/.codex /home/node/.config /home/node/.cache

# Make git use gh for GitHub auth system-wide, so `git push` keeps working after
# rebuilds once the gh token is present (persisted via the ~/.config volume).
RUN git config --system credential."https://github.com".helper "!gh auth git-credential" \
    && git config --system credential."https://gist.github.com".helper "!gh auth git-credential"

# Permit only ownership setup of the declared, isolated volume roots.
COPY prepare-dependencies.sh /usr/local/bin/prepare-agent-dependencies
COPY dependency-volumes.txt /usr/local/share/grenmet-dependency-volumes.txt
RUN chmod 755 /usr/local/bin/prepare-agent-dependencies \
    && echo 'node ALL=(root) NOPASSWD: /usr/local/bin/prepare-agent-dependencies' > /etc/sudoers.d/grenmet-dependencies \
    && chmod 440 /etc/sudoers.d/grenmet-dependencies \
    && visudo -cf /etc/sudoers.d/grenmet-dependencies

# bubblewrap — unprivileged sandboxing (bwrap); libcap-dev provides the
# capability headers it links against.
RUN apt-get update \
    && apt-get install -y --no-install-recommends bubblewrap libcap-dev \
    && rm -rf /var/lib/apt/lists/*

# Run as the unprivileged 'node' user, not root
USER node
WORKDIR /workspace
