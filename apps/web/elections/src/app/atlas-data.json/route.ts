import { buildAtlas } from "@/data/atlas";
import { data, geo, results } from "@/data/load";

// Built once at build time; the Results atlas fetches it in the browser.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildAtlas(data, geo, results));
}
