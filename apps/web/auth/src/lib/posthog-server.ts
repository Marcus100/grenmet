import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";
import { env } from "./env";

/** Count authentication outcomes without identifying a person or session. */
export async function captureServerEvent(
  event: "sign_in" | "sign_out" | "sign_up"
): Promise<void> {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;
  try {
    const client = new PostHog(apiKey, {
      host: env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
      requestTimeout: 2000,
      fetchRetryCount: 0,
    });
    client.capture({
      distinctId: randomUUID(),
      event,
      properties: { $process_person_profile: false, $geoip_disable: true },
    });
    await client.shutdown(2000);
  } catch {
    // Optional analytics must never prevent authentication or cookie removal.
  }
}
