# syntax=docker/dockerfile:1.7
FROM python:3.11-slim@sha256:b596083aa14d47c78a652138aa9b98607585499d7c7ec343ae378f6c5770822d

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.11.26@sha256:3d868e555f8f1dbc324afa005066cd11e1053fc4743b9808ca8025283e65efa5 /uv /bin/uv

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml ./
COPY uv.lock ./

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-cache

# Copy application code
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY email-templates ./email-templates
COPY scripts ./scripts

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
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
