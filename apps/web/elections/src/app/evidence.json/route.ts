import { EVIDENCE, metricEvidence } from "@/data/evidence";
import { data } from "@/data/load";
import { EVENTS } from "@/data/model";
export const dynamic = "force-static";
export function GET() {
  return Response.json({
    sources: EVIDENCE,
    note: "Evidence accompanies the original CSVs without changing recorded totals. Derived statistics inherit the limitations of their inputs.",
    events: EVENTS.map((event) => ({
      id: event.id,
      votes: metricEvidence(data, event.id, "votes"),
      seats: metricEvidence(data, event.id, "seats"),
      turnout: metricEvidence(data, event.id, "turnout"),
    })),
  });
}
