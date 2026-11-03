import Script from "next/script";
import { PUBLIC_ENV_PATH } from "../lib/public-env";

/**
 * Loads this environment's public settings (`/runtime-env.js`) before the app
 * hydrates. Render it once in each root layout.
 */
export function PublicEnvScript() {
  // biome-ignore lint/correctness/noBeforeInteractiveScriptOutsideDocument: App Router root layouts are the documented place for beforeInteractive
  return <Script src={PUBLIC_ENV_PATH} strategy="beforeInteractive" />;
}
