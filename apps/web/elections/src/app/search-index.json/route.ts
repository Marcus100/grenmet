import { campaign, geo, results } from "@/data/load";
import { buildSearchIndex } from "@/data/search";

// Built once at build time; the seat search fetches it on first focus.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildSearchIndex(results, geo, campaign));
}
