import { z } from "zod";

/**
 * The account app's address: an absolute http(s) URL only. The account menu
 * renders it as a link, so `javascript:` and other schemes are refused here.
 */
export const accountAppUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      // Not a URL at all: the url() check above has already failed.
      return false;
    }
  }, "ACCOUNT_APP_URL must be an http or https URL");
