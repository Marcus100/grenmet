import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    // Public API URL — passed at Docker build time via build-arg
    NEXT_PUBLIC_API_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:8000"),
    NEXT_PUBLIC_ENVIRONMENT: z
      .enum(["local", "staging", "production"])
      .optional()
      .default("local"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
  },
});
