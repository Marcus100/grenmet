import { PostHog } from "posthog-node";
import { env } from "./env";

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  const client = new PostHog(apiKey, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });

  client.capture({ distinctId, event, properties: properties ?? {} });
  await client.shutdown();
}
