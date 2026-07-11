# Dev container image for running coding agents (Claude Code, Codex) fully
# inside Docker. Everything the agent edits or executes happens in here, not
# on your Windows host.
FROM node:24-bookworm

# System tools the agents commonly shell out to (git, search, curl, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates \
      less \
      ripgrep \
      procps \
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
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# pnpm v10 via corepack (matches the monorepo's package manager)
RUN corepack enable && corepack prepare pnpm@10 --activate

# The coding agents themselves
RUN npm install -g @anthropic-ai/claude-code @openai/codex

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

# Run as the unprivileged 'node' user, not root
USER node
WORKDIR /workspace
