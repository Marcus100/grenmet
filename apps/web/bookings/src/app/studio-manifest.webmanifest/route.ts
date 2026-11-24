import { studioManifest } from "@/lib/studio-manifest";

/**
 * The studio's web app manifest. It lives outside `/studio` on purpose: the
 * proxy sends a request with no session cookie under `/studio` to sign-in, and
 * browsers fetch a manifest without credentials. It holds nothing private.
 */
export function GET() {
  return new Response(JSON.stringify(studioManifest()), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
