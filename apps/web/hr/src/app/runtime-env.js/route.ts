import { publicEnvResponse } from "@barrelsgd/ui/lib/public-env";

// This environment's public settings for the browser, read per request so one
// image serves every environment (issue #1019).
export const dynamic = "force-dynamic";

export function GET() {
  return publicEnvResponse();
}
