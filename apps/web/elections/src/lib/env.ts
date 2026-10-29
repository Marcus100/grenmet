import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {},
  client: {
    // Canonical public address, for absolute share-preview links (metadataBase).
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3007"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
