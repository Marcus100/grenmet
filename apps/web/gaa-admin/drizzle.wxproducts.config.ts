throw new Error(
  "Weather schema changes are owned by FastAPI. Use src/wxproducts/alembic.ini from apps/api/fastapi; do not generate new Drizzle weather migrations."
);

export {};
