import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";

const pool = new Pool({
  connectionString: env.WXWATCH_DATABASE_URL,
});

const wxwatchDb = drizzle(pool);

export { wxwatchDb };
