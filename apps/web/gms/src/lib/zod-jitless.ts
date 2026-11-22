import { config } from "zod";

/**
 * Zod 4 probes `new Function("")` in the browser on the first object parse to
 * pick a compiled fast path. Under the Report-Only CSP (no 'unsafe-eval') that
 * probe is reported as an eval violation on every GMS page. Jitless mode skips
 * the probe and uses zod's non-compiled parse path, with the same results.
 *
 * Imported first by instrumentation-client.ts so it runs before any schema parse.
 */
config({ jitless: true });
