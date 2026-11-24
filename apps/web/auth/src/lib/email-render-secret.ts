import { z } from "zod";

/** The shortest shared secret the email render route accepts. */
export const EMAIL_RENDER_SECRET_MIN_LENGTH = 32;

/**
 * `EMAIL_RENDER_SECRET` in the env schema. A missing, empty or short value
 * (fewer than 32 characters) becomes `undefined`, so the render route refuses
 * every call (503) rather than the whole sign-in app failing to start over an
 * email setting. Kept free of Node modules: `env.ts` is also read by client
 * components.
 */
export const emailRenderSecretSchema = z
  .string()
  .optional()
  .transform((value) =>
    value && value.length >= EMAIL_RENDER_SECRET_MIN_LENGTH ? value : undefined
  );
