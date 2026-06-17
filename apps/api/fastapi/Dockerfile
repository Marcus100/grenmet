# syntax=docker/dockerfile:1.7
FROM python:3.14-slim@sha256:fb83750094b46fd6b8adaa80f66e2302ecbe45d513f6cece637a841e1025b4ca

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

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
