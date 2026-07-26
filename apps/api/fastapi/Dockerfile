# syntax=docker/dockerfile:1.7
FROM python:3.13-slim-bookworm@sha256:9d7f287598e1a5a978c015ee176d8216435aaf335ed69ac3c38dd1bbb10e8d64

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.11.26@sha256:3d868e555f8f1dbc324afa005066cd11e1053fc4743b9808ca8025283e65efa5 /uv /bin/uv

# Set working directory
WORKDIR /app

# Copy the workspace definition and member metadata first for layer caching.
COPY pyproject.toml uv.lock ./
COPY apps/api/fastapi/pyproject.toml apps/api/fastapi/pyproject.toml
COPY scripts/scrapy-wxwatch/pyproject.toml scripts/scrapy-wxwatch/pyproject.toml
COPY scripts/sutron-collector/pyproject.toml scripts/sutron-collector/pyproject.toml
COPY notebooks/pyproject.toml notebooks/pyproject.toml
COPY geonetcast/pyproject.toml geonetcast/pyproject.toml

# Install only FastAPI dependencies. Workspace packages are installed after the
# application source is copied, keeping this expensive layer cacheable.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --package fast-back --no-install-workspace --no-cache

# Copy application code
WORKDIR /app/apps/api/fastapi
COPY apps/api/fastapi/src ./src
COPY apps/api/fastapi/alembic ./alembic
COPY apps/api/fastapi/alembic.ini ./alembic.ini
COPY apps/api/fastapi/email-templates ./email-templates
COPY apps/api/fastapi/scripts ./scripts

# Install the FastAPI workspace member now that its source is present.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --package fast-back --no-cache

# Create non-root user
RUN groupadd -r appuser \
    && useradd -r -g appuser -u 1000 appuser \
    && chown -R appuser:appuser /app \
    && mkdir -p /home/appuser/.cache/uv \
    && chown -R appuser:appuser /home/appuser/.cache

# Switch to non-root user
USER appuser

# Expose port (8000 is standard)
EXPOSE 8000

# Run the application
CMD ["uv", "run", "--frozen", "--package", "fast-back", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
