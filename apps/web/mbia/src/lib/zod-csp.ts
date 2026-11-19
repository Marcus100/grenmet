import { z } from "zod";

/**
 * Zod 4 probes `new Function("")` the first time it builds an object schema,
 * to choose a faster parser. The site's Content-Security-Policy has no
 * 'unsafe-eval', so that probe is reported as an eval violation on /contact.
 * `jitless` skips the probe. Parsing results are unchanged; only the generated
 * fast path is off, which costs nothing for a contact form.
 */
export function disableZodEvalProbe(): void {
  z.config({ jitless: true });
}
