# syntax=docker/dockerfile:1.7
FROM python:3.13-slim-bookworm@sha256:9d7f287598e1a5a978c015ee176d8216435aaf335ed69ac3c38dd1bbb10e8d64

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.11.26@sha256:3d868e555f8f1dbc324afa005066cd11e1053fc4743b9808ca8025283e65efa5 /uv /bin/uv

# uv runs again at container start (prestart.sh syncs, api/worker use `uv run`),
# so point HOME and the uv cache at a directory appuser owns. UV_LINK_MODE=copy
# copies out of the build cache mount instead of hardlinking across filesystems.
ENV UV_LINK_MODE=copy \
    HOME=/home/appuser \
    UV_CACHE_DIR=/home/appuser/.cache/uv \
    PATH="/app/.venv/bin:$PATH"

# Create the non-root user before anything lands in /app. Doing this first means
# every later layer is written with the right ownership, so no recursive chown is
# needed over the venv (that chown cost ~135s and duplicated the whole venv).
# uid 1000 matches the host user, keeping bind-mounted source writable.
RUN groupadd -r appuser \
    && useradd -r -g appuser -u 1000 -m appuser \
    && mkdir -p /app /home/appuser/.cache/uv \
    && chown appuser:appuser /app \
    && chown -R appuser:appuser /home/appuser/.cache

USER appuser
WORKDIR /app

# Copy the workspace definition and member metadata first for layer caching.
COPY --chown=appuser:appuser pyproject.toml uv.lock ./
COPY --chown=appuser:appuser apps/api/fastapi/pyproject.toml apps/api/fastapi/pyproject.toml
COPY --chown=appuser:appuser scripts/scrapy-wxwatch/pyproject.toml scripts/scrapy-wxwatch/pyproject.toml
COPY --chown=appuser:appuser scripts/sutron-collector/pyproject.toml scripts/sutron-collector/pyproject.toml
COPY --chown=appuser:appuser notebooks/pyproject.toml notebooks/pyproject.toml
COPY --chown=appuser:appuser geonetcast/pyproject.toml geonetcast/pyproject.toml

# Install only FastAPI dependencies. Workspace packages are installed after the
# application source is copied, keeping this expensive layer cacheable.
RUN --mount=type=cache,target=/home/appuser/.cache/uv,uid=1000,gid=1000 \
    uv sync --frozen --package fast-back --no-install-workspace

# Copy application code
WORKDIR /app/apps/api/fastapi
COPY --chown=appuser:appuser apps/api/fastapi/src ./src
COPY --chown=appuser:appuser apps/api/fastapi/alembic ./alembic
COPY --chown=appuser:appuser apps/api/fastapi/alembic.ini ./alembic.ini
COPY --chown=appuser:appuser apps/api/fastapi/email-templates ./email-templates
COPY --chown=appuser:appuser apps/api/fastapi/scripts ./scripts

# Install the FastAPI workspace member now that its source is present.
RUN --mount=type=cache,target=/home/appuser/.cache/uv,uid=1000,gid=1000 \
    uv sync --frozen --package fast-back

# Expose port (8000 is standard)
EXPOSE 8000

# Run the application
CMD ["uv", "run", "--frozen", "--package", "fast-back", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
